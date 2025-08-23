import { IsEnum, IsNumber, IsString, IsOptional, IsArray, IsPositive, Min } from 'class-validator';

export class CreateTransactionRequestDto {
    @IsEnum(['buy', 'sell'])
    order_trade_type: 'buy' | 'sell';

    @IsEnum(['market', 'limit'])
    order_type: 'market' | 'limit';

    @IsString()
    order_token_name: string;

    @IsString()
    order_token_address: string;

    @IsNumber()
    @Min(0)
    order_price: number;

    @IsNumber()
    @IsPositive()
    order_qlty: number;

    @IsString()
    user_wallet_address: string;

    @IsOptional()
    @IsArray()
    group_list?: number[];

    @IsOptional()
    @IsArray()
    member_list?: number[];
}
