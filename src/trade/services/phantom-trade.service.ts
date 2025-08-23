import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateTransactionRequestDto } from '../dto/create-transaction-request.dto';
import { TransactionResponseDto } from '../dto/transaction-response.dto';
import { SubmitSignedTransactionDto } from '../dto/submit-signed-transaction.dto';
import { SolanaService } from '../../solana/solana.service';
import { NotificationService } from '../../notifications/notification.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { StandardResponse } from '../interfaces/standard-response.interface';

import { SolanaListToken } from '../../solana/entities/solana-list-token.entity';
import { CacheService } from '../../cache/cache.service';
import * as https from 'https';

// Jupiter API for token swaps
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

@Injectable()
export class PhantomTradeService {
    private readonly logger = new Logger(PhantomTradeService.name);

    constructor(

        @InjectRepository(SolanaListToken)
        private solanaTokenRepository: Repository<SolanaListToken>,

        private solanaService: SolanaService,
        private notificationService: NotificationService,
        private eventEmitter: EventEmitter2,

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

            // 4. Generate unique transaction ID
            const transactionId = `phantom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 5. Get Jupiter quote for swap
            const jupiterQuote = await this.getJupiterQuote(createTransactionRequestDto, token);
            if (!jupiterQuote.success) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Failed to get swap quote',
                    error: jupiterQuote.error
                };
            }

            // 6. Get Jupiter swap transaction
            const jupiterSwap = await this.getJupiterSwapTransaction(jupiterQuote.data, userPublicKey);
            if (!jupiterSwap.success) {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Failed to create swap transaction',
                    error: jupiterSwap.error
                };
            }

            // 7. Deserialize and prepare transaction
            let transaction: Transaction | VersionedTransaction;
            let blockhash: string = 'versioned';
            
            try {
                // Try to deserialize as VersionedTransaction first
                transaction = VersionedTransaction.deserialize(Buffer.from(jupiterSwap.data.swapTransaction, 'base64'));
                // For VersionedTransaction, we don't need to set blockhash manually
            } catch (error) {
                // Fallback to Legacy Transaction
                transaction = Transaction.from(Buffer.from(jupiterSwap.data.swapTransaction, 'base64'));
                
                // 8. Get recent blockhash for legacy transaction
                const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
                const blockhashData = await connection.getLatestBlockhash();
                blockhash = blockhashData.blockhash;

                (transaction as Transaction).recentBlockhash = blockhash;
                (transaction as Transaction).feePayer = userPublicKey;
            }

            // 9. Serialize transaction
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false
            }).toString('base64');

            // 10. Cache transaction data
            const cacheKey = `transaction:${transactionId}`;
            const cacheData = {
                order_id: transactionId,
                user_wallet_address: createTransactionRequestDto.user_wallet_address,
                transaction_data: transaction,
                jupiter_quote: jupiterQuote.data,
                order_details: {
                    order_trade_type: createTransactionRequestDto.order_trade_type,
                    order_type: createTransactionRequestDto.order_type,
                    order_token_name: token.slt_name,
                    order_token_address: createTransactionRequestDto.order_token_address,
                    order_price: createTransactionRequestDto.order_price,
                    order_qlty: createTransactionRequestDto.order_qlty,
                    order_total_value: createTransactionRequestDto.order_price * createTransactionRequestDto.order_qlty,
                    order_status: 'pending'
                },
                created_at: new Date(),
                timeout: 300 // 5 minutes timeout
            };
            
            await this.cacheService.set(cacheKey, cacheData, 300);
            this.logger.log(`Cached transaction data: ${cacheKey} for 5 minutes`);

            const response: TransactionResponseDto = {
                order_id: transactionId,
                transaction_data: {
                    instructions: transaction instanceof Transaction ? transaction.instructions : [],
                    recentBlockhash: blockhash || 'versioned',
                    feePayer: userPublicKey.toString(),
                    signers: transaction.signatures || []
                },
                serialized_transaction: serializedTransaction,
                order_details: {
                    trade_type: createTransactionRequestDto.order_trade_type,
                    token_name: token.slt_name,
                    token_address: createTransactionRequestDto.order_token_address,
                    quantity: createTransactionRequestDto.order_qlty,
                    price: createTransactionRequestDto.order_price,
                    total_value: createTransactionRequestDto.order_price * createTransactionRequestDto.order_qlty,
                    order_type: createTransactionRequestDto.order_type
                },
                estimated_fee: jupiterQuote.data.feeAmount ? jupiterQuote.data.feeAmount / 1e9 : 0.000005, // Convert lamports to SOL
                timeout_seconds: 300
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
            this.logger.log(`Looking for cached transaction: ${cacheKey}`);
            
            const cachedData = await this.cacheService.get(cacheKey) as any;

            if (!cachedData) {
                this.logger.error(`Transaction not found in cache: ${cacheKey}`);
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: 'Transaction expired or not found',
                    error: 'Transaction timeout'
                };
            }

            this.logger.log(`Found cached transaction: ${JSON.stringify(cachedData, null, 2)}`);

            // 2. Extract order details from cached data
            const orderDetails = cachedData.order_details;
            orderDetails.order_id = submitSignedTransactionDto.order_id;

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
            
            let txHash: string;
            try {
                const signedTransactionBuffer = Buffer.from(submitSignedTransactionDto.signed_transaction, 'base64');
                
                // Log transaction details for debugging
                this.logger.log(`Submitting transaction for order: ${submitSignedTransactionDto.order_id}`);
                this.logger.log(`Transaction buffer length: ${signedTransactionBuffer.length}`);
                this.logger.log(`Signature: ${submitSignedTransactionDto.signature}`);
                
                txHash = await connection.sendRawTransaction(signedTransactionBuffer, {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                });
                
                this.logger.log(`Transaction submitted successfully: ${txHash}`);
                
            } catch (error) {
                this.logger.error(`Transaction submission failed: ${error.message}`);
                
                // Log detailed error information
                if (error.logs) {
                    this.logger.error(`Transaction logs: ${JSON.stringify(error.logs)}`);
                }
                
                if (error.message.includes('signature verification failure')) {
                    return {
                        status: HttpStatus.BAD_REQUEST,
                        message: 'Transaction signature verification failed',
                        error: 'Invalid signature or transaction structure'
                    };
                }
                
                return {
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: 'Transaction submission failed',
                    error: error.message
                };
            }

            // 5. Clear cache
            await this.cacheService.del(cacheKey);

            // 6. Emit event
            this.eventEmitter.emit('transaction.submitted', {
                order_id: orderDetails.order_id,
                transaction_hash: txHash,
                wallet_address: cachedData.user_wallet_address
            });

            // 7. Send notification (optional - can be removed if not needed)
            // await this.notificationService.notifyNewOrder(orderDetails);

            return {
                status: HttpStatus.OK,
                message: 'Transaction submitted successfully',
                data: {
                    order_id: orderDetails.order_id,
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





    private async verifySignature(
        signature: string,
        walletAddress: string,
        signedTransaction: string
    ): Promise<boolean> {
        try {
            // Basic validation
            if (!signature || !walletAddress || !signedTransaction) {
                this.logger.error('Missing required parameters for signature verification');
                return false;
            }

            // Verify signature format (Base58, 88 characters)
            if (signature.length !== 88) {
                this.logger.error(`Invalid signature length: ${signature.length}, expected 88`);
                return false;
            }

            // Verify wallet address format
            try {
                new PublicKey(walletAddress);
            } catch (error) {
                this.logger.error(`Invalid wallet address: ${walletAddress}`);
                return false;
            }

            // Verify signed transaction format
            try {
                const transactionBuffer = Buffer.from(signedTransaction, 'base64');
                if (transactionBuffer.length === 0) {
                    this.logger.error('Empty signed transaction');
                    return false;
                }
            } catch (error) {
                this.logger.error(`Invalid signed transaction format: ${error.message}`);
                return false;
            }

            // For now, return true if basic validation passes
            // In production, you should implement proper cryptographic verification
            this.logger.log(`Signature verification passed for wallet: ${walletAddress}`);
            return true;

        } catch (error) {
            this.logger.error(`Error verifying signature: ${error.message}`);
            return false;
        }
    }

    private async getJupiterQuote(
        createTransactionRequestDto: CreateTransactionRequestDto,
        token: SolanaListToken
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            // SOL mint address
            const SOL_MINT = 'So11111111111111111111111111111111111111112';
            
            let inputMint: string;
            let outputMint: string;
            let amount: string;

            if (createTransactionRequestDto.order_trade_type === 'buy') {
                // Buy token with SOL
                inputMint = SOL_MINT;
                outputMint = createTransactionRequestDto.order_token_address;
                // Calculate SOL amount needed (price * quantity)
                const solAmount = createTransactionRequestDto.order_price * createTransactionRequestDto.order_qlty;
                amount = (solAmount * 1e9).toString(); // Convert SOL to lamports
            } else {
                // Sell token for SOL
                inputMint = createTransactionRequestDto.order_token_address;
                outputMint = SOL_MINT;
                // Use token quantity directly (assuming 6 decimals for most SPL tokens)
                amount = (createTransactionRequestDto.order_qlty * 1e6).toString();
            }

            this.logger.log(`Getting Jupiter quote: ${inputMint} -> ${outputMint}, amount: ${amount}`);

            const quoteData = await this.makeHttpRequest(
                `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`,
                'GET'
            );
            
            this.logger.log(`Jupiter quote received: ${JSON.stringify(quoteData, null, 2)}`);
            
            return {
                success: true,
                data: quoteData
            };

        } catch (error) {
            this.logger.error(`Error getting Jupiter quote: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    private async getJupiterSwapTransaction(
        quoteData: any,
        userPublicKey: PublicKey
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            this.logger.log(`Creating Jupiter swap transaction for user: ${userPublicKey.toString()}`);

            const swapData = await this.makeHttpRequest(
                JUPITER_SWAP_API,
                'POST',
                {
                    quoteResponse: quoteData,
                    userPublicKey: userPublicKey.toString(),
                    wrapUnwrapSOL: true
                }
            );
            
            this.logger.log(`Jupiter swap transaction created successfully`);
            
            return {
                success: true,
                data: swapData
            };

        } catch (error) {
            this.logger.error(`Error getting Jupiter swap transaction: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    private async makeHttpRequest(url: string, method: string = 'GET', body?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (body && method === 'POST') {
                const postData = JSON.stringify(body);
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const statusCode = res.statusCode || 0;
                    if (statusCode >= 200 && statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (error) {
                            resolve(data);
                        }
                    } else {
                        reject(new Error(`HTTP ${statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body && method === 'POST') {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }


}
