export class TransactionResponseDto {
    order_id: number;

    transaction_data: {
        instructions: any[];
        recentBlockhash: string;
        feePayer: string;
        signers?: any[];
    };

    serialized_transaction: string;

    order_details: {
        trade_type: 'buy' | 'sell';
        token_name: string;
        token_address: string;
        quantity: number;
        price: number;
        total_value: number;
        order_type: 'market' | 'limit';
    };

    estimated_fee: number;

    timeout_seconds: number;
}
