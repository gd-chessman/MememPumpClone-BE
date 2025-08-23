import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingOrder } from '../entities/trading-order.entity';
import { CreateTransactionRequestDto } from '../dto/create-transaction-request.dto';
import { TransactionResponseDto } from '../dto/transaction-response.dto';
import { SubmitSignedTransactionDto } from '../dto/submit-signed-transaction.dto';
import { SolanaService } from '../../solana/solana.service';
import { NotificationService } from '../../notifications/notification.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { StandardResponse } from '../interfaces/standard-response.interface';
import { OrderBookService } from '../order-book.service';
import { MasterTradingService } from '../../master-trading/master-trading.service';
import { SolanaListToken } from '../../solana/entities/solana-list-token.entity';
import { CacheService } from '../../cache/cache.service';


@Injectable()
export class PhantomTradeService {
    private readonly logger = new Logger(PhantomTradeService.name);

    constructor(
        @InjectRepository(TradingOrder)
        private tradingOrderRepository: Repository<TradingOrder>,
        @InjectRepository(SolanaListToken)
        private solanaTokenRepository: Repository<SolanaListToken>,

        private solanaService: SolanaService,
        private notificationService: NotificationService,
        private eventEmitter: EventEmitter2,
        private orderBookService: OrderBookService,
        private masterTradingService: MasterTradingService,
        private cacheService: CacheService
    ) {}

    async createTransaction(createTransactionRequestDto: CreateTransactionRequestDto): Promise<StandardResponse<TransactionResponseDto>> {
        try {
            this.logger.log(`Creating transaction for wallet: ${createTransactionRequestDto.user_wallet_address}`);

            // 1. Validate user wallet address
            let userPublicKey: PublicKey;
            try {
                userPublicKey = new PublicKey(createTransactionRequestDto.user_wallet_address);
            } catch (error) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Invalid wallet address',
                    error: 'Invalid public key format'
                };
            }

            // 2. Find token in database
            const token = await this.solanaTokenRepository.findOne({
                where: { slt_address: createTransactionRequestDto.order_token_address }
            });

            if (!token) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Token not found',
                    error: 'Token not supported'
                };
            }

            // 3. Check user balance if selling
            if (createTransactionRequestDto.order_trade_type === 'sell') {
                const tokenBalance = await this.solanaService.getTokenBalance(
                    createTransactionRequestDto.user_wallet_address,
                    createTransactionRequestDto.order_token_address
                );

                if (tokenBalance < createTransactionRequestDto.order_qlty) {
                    return {
                        status: HttpStatus.BAD_REQUEST,
                        message: 'Insufficient token balance',
                        error: `Required: ${createTransactionRequestDto.order_qlty}, Available: ${tokenBalance}`
                    };
                }
            }

            // 4. Create pending order
            const newOrder = new TradingOrder();
            Object.assign(newOrder, {
                order_trade_type: createTransactionRequestDto.order_trade_type,
                order_type: createTransactionRequestDto.order_type,
                order_token_name: token.slt_name,
                order_token_address: createTransactionRequestDto.order_token_address,
                order_price: createTransactionRequestDto.order_price,
                order_qlty: createTransactionRequestDto.order_qlty,
                order_total_value: createTransactionRequestDto.order_price * createTransactionRequestDto.order_qlty,
                order_status: 'pending',
                order_wallet_id: 0, // Will be updated after transaction is signed
            });

            const savedOrder = await this.tradingOrderRepository.save(newOrder);

            // 5. Build transaction
            const transaction = await this.buildTransaction(
                savedOrder,
                userPublicKey,
                createTransactionRequestDto
            );

            // 6. Get recent blockhash
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPublicKey;

            // 7. Serialize transaction
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false
            }).toString('base64');

            // 8. Cache transaction data
            const cacheKey = `transaction:${savedOrder.order_id}`;
            await this.cacheService.set(cacheKey, {
                order_id: savedOrder.order_id,
                user_wallet_address: createTransactionRequestDto.user_wallet_address,
                transaction_data: transaction,
                created_at: new Date(),
                timeout: 60 // 60 seconds timeout
            }, 60);

            const response: TransactionResponseDto = {
                order_id: savedOrder.order_id,
                transaction_data: {
                    instructions: transaction.instructions,
                    recentBlockhash: blockhash,
                    feePayer: userPublicKey.toString(),
                    signers: transaction.signatures
                },
                serialized_transaction: serializedTransaction,
                order_details: {
                    trade_type: savedOrder.order_trade_type,
                    token_name: savedOrder.order_token_name,
                    token_address: savedOrder.order_token_address,
                    quantity: savedOrder.order_qlty,
                    price: savedOrder.order_price,
                    total_value: savedOrder.order_total_value,
                    order_type: savedOrder.order_type
                },
                estimated_fee: 0.000005, // Estimated fee
                timeout_seconds: 60
            };

            return {
                status: HttpStatus.CREATED,
                message: 'Transaction created successfully',
                data: response
            };

        } catch (error) {
            this.logger.error(`Error creating transaction: ${error.message}`);
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to create transaction',
                error: error.message
            };
        }
    }

    async submitSignedTransaction(submitSignedTransactionDto: SubmitSignedTransactionDto): Promise<StandardResponse<any>> {
        try {
            this.logger.log(`Submitting signed transaction for order: ${submitSignedTransactionDto.order_id}`);

            // 1. Get cached transaction data
            const cacheKey = `transaction:${submitSignedTransactionDto.order_id}`;
            const cachedData = await this.cacheService.get(cacheKey) as any;

            if (!cachedData) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Transaction expired or not found',
                    error: 'Transaction timeout'
                };
            }

            // 2. Get order
            const order = await this.tradingOrderRepository.findOne({
                where: { order_id: submitSignedTransactionDto.order_id }
            });

            if (!order) {
                return {
                    status: HttpStatus.NOT_FOUND,
                    message: 'Order not found',
                    error: 'Order does not exist'
                };
            }

            // 3. Verify signature
            const isValidSignature = await this.verifySignature(
                submitSignedTransactionDto.signature,
                cachedData.user_wallet_address,
                submitSignedTransactionDto.signed_transaction
            );

            if (!isValidSignature) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Invalid signature',
                    error: 'Signature verification failed'
                };
            }

            // 4. Submit transaction to Solana network
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            
            const signedTransactionBuffer = Buffer.from(submitSignedTransactionDto.signed_transaction, 'base64');
            const txHash = await connection.sendRawTransaction(signedTransactionBuffer, {
                skipPreflight: false,
                preflightCommitment: 'confirmed'
            });

            // 5. Update order with transaction hash
            order.order_tx_hash = txHash;
            order.order_status = 'pending';
            await this.tradingOrderRepository.save(order);

            // 6. Clear cache
            await this.cacheService.del(cacheKey);

            // 7. Process order based on type
            if (order.order_type === 'market') {
                await this.processMarketOrder(order);
            } else {
                await this.addToOrderBook(order);
            }

            // 8. Emit event
            this.eventEmitter.emit('transaction.submitted', {
                order_id: order.order_id,
                transaction_hash: txHash,
                wallet_address: cachedData.user_wallet_address
            });

            // 9. Send notification
            await this.notificationService.notifyNewOrder(order);

            return {
                status: HttpStatus.OK,
                message: 'Transaction submitted successfully',
                data: {
                    order_id: order.order_id,
                    transaction_hash: txHash,
                    status: 'submitted'
                }
            };

        } catch (error) {
            this.logger.error(`Error submitting signed transaction: ${error.message}`);
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to submit transaction',
                error: error.message
            };
        }
    }

    async getPhantomOrders(userWalletAddress: string, limit: number = 10, offset: number = 0): Promise<StandardResponse<any>> {
        try {
            // For Phantom orders, we need to filter by transaction hash pattern or use a separate field
            // This is a simplified approach - in real implementation, you might want to add a field to track Phantom orders
            const orders = await this.tradingOrderRepository
                .createQueryBuilder('order')
                .where('order.order_tx_hash IS NOT NULL AND order.order_tx_hash != :empty', { empty: '' })
                .orderBy('order.order_created_at', 'DESC')
                .skip(offset)
                .take(limit)
                .getMany();

            const formattedOrders = orders.map(order => ({
                order_id: order.order_id,
                user_wallet_address: userWalletAddress,
                order_trade_type: order.order_trade_type,
                order_type: order.order_type,
                token: {
                    name: order.order_token_name,
                    address: order.order_token_address
                },
                quantity: order.order_qlty,
                price: order.order_price,
                total_value: order.order_total_value,
                status: order.order_status,
                transaction_hash: order.order_tx_hash,
                created_at: order.order_created_at,
                executed_at: order.order_executed_at,
                error_message: order.order_error_message
            }));

            return {
                status: HttpStatus.OK,
                message: 'Phantom orders retrieved successfully',
                data: formattedOrders
            };

        } catch (error) {
            this.logger.error(`Error getting Phantom orders: ${error.message}`);
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to get Phantom orders',
                error: error.message
            };
        }
    }

    async verifyTransactionStatus(transactionHash: string): Promise<StandardResponse<any>> {
        try {
            const order = await this.tradingOrderRepository.findOne({
                where: { order_tx_hash: transactionHash }
            });

            if (!order) {
                return {
                    status: HttpStatus.NOT_FOUND,
                    message: 'Order not found'
                };
            }

            // Verify transaction on Solana network
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            const transaction = await connection.getTransaction(transactionHash);

            if (!transaction) {
                // Transaction not found on blockchain
                order.order_status = 'failed';
                order.order_error_message = 'Transaction not found on blockchain';
                await this.tradingOrderRepository.save(order);

                return {
                    status: HttpStatus.OK,
                    message: 'Transaction verification completed',
                    data: {
                        status: 'failed',
                        message: 'Transaction not found on blockchain'
                    }
                };
            }

            if (transaction.meta?.err) {
                // Transaction failed
                order.order_status = 'failed';
                order.order_error_message = 'Transaction failed on blockchain';
                await this.tradingOrderRepository.save(order);

                return {
                    status: HttpStatus.OK,
                    message: 'Transaction verification completed',
                    data: {
                        status: 'failed',
                        message: 'Transaction failed on blockchain'
                    }
                };
            }

            // Transaction successful
            if (order.order_status === 'pending') {
                order.order_status = 'executed';
                order.order_executed_at = new Date();
                await this.tradingOrderRepository.save(order);
            }

            return {
                status: HttpStatus.OK,
                message: 'Transaction verification completed',
                data: {
                    status: 'executed',
                    message: 'Transaction confirmed on blockchain'
                }
            };

        } catch (error) {
            this.logger.error(`Error verifying transaction: ${error.message}`);
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to verify transaction',
                error: error.message
            };
        }
    }

    private async buildTransaction(
        order: TradingOrder,
        userPublicKey: PublicKey,
        createTransactionRequestDto: CreateTransactionRequestDto
    ): Promise<Transaction> {
        const transaction = new Transaction();

        // Add swap instruction based on order type
        if (createTransactionRequestDto.order_trade_type === 'buy') {
            // Add buy instruction
            const buyInstruction = await this.createBuyInstruction(
                order,
                userPublicKey,
                createTransactionRequestDto
            );
            transaction.add(buyInstruction);
        } else {
            // Add sell instruction
            const sellInstruction = await this.createSellInstruction(
                order,
                userPublicKey,
                createTransactionRequestDto
            );
            transaction.add(sellInstruction);
        }

        return transaction;
    }

    private async createBuyInstruction(
        order: TradingOrder,
        userPublicKey: PublicKey,
        createTransactionRequestDto: CreateTransactionRequestDto
    ): Promise<TransactionInstruction> {
        // This is a simplified example - you'll need to implement actual swap logic
        // based on your DEX (Jupiter, Raydium, etc.)
        
        // For now, return a dummy instruction
        return SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: new PublicKey('11111111111111111111111111111111'),
            lamports: 1000
        });
    }

    private async createSellInstruction(
        order: TradingOrder,
        userPublicKey: PublicKey,
        createTransactionRequestDto: CreateTransactionRequestDto
    ): Promise<TransactionInstruction> {
        // This is a simplified example - you'll need to implement actual swap logic
        // based on your DEX (Jupiter, Raydium, etc.)
        
        // For now, return a dummy instruction
        return SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: new PublicKey('11111111111111111111111111111111'),
            lamports: 1000
        });
    }

    private async verifySignature(
        signature: string,
        walletAddress: string,
        signedTransaction: string
    ): Promise<boolean> {
        try {
            // Basic validation - in production, implement proper signature verification
            if (!signature || !walletAddress || !signedTransaction) {
                return false;
            }

            // Verify signature format
            if (signature.length !== 88) {
                return false;
            }

            // Verify wallet address format
            try {
                new PublicKey(walletAddress);
            } catch {
                return false;
            }

            // Verify signed transaction format
            try {
                Buffer.from(signedTransaction, 'base64');
            } catch {
                return false;
            }

            return true;

        } catch (error) {
            this.logger.error(`Error verifying signature: ${error.message}`);
            return false;
        }
    }

    private async processMarketOrder(order: TradingOrder): Promise<void> {
        try {
            // For market orders, execute immediately
            order.order_status = 'executed';
            order.order_executed_at = new Date();
            await this.tradingOrderRepository.save(order);

            this.logger.log(`Market order ${order.order_id} executed immediately`);
        } catch (error) {
            this.logger.error(`Error processing market order: ${error.message}`);
            throw error;
        }
    }

    private async addToOrderBook(order: TradingOrder): Promise<void> {
        try {
            // Add to order book for limit orders
            await this.orderBookService.addToOrderBook(order);
            this.logger.log(`Limit order ${order.order_id} added to order book`);
        } catch (error) {
            this.logger.error(`Error adding to order book: ${error.message}`);
            throw error;
        }
    }
}
