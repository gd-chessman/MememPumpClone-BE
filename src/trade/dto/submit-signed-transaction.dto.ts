import { IsString, IsNumber } from 'class-validator';

export class SubmitSignedTransactionDto {
    @IsString()
    order_id: string;

    @IsString()
    signature: string;

    @IsString()
    signed_transaction: string;
}
