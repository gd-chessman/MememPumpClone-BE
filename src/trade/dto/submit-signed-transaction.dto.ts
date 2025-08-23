import { IsString, IsNumber } from 'class-validator';

export class SubmitSignedTransactionDto {
    @IsNumber()
    order_id: number;

    @IsString()
    signature: string;

    @IsString()
    signed_transaction: string;
}
