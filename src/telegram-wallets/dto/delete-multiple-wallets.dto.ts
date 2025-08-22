import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class DeleteMultipleWalletsDto {
    @ApiProperty({
        description: 'Array of wallet IDs to delete',
        example: [123, 456, 789],
        type: [Number],
        minimum: 1,
        maximum: 50
    })
    @IsArray()
    @IsNumber({}, { each: true })
    @ArrayMinSize(1, { message: 'At least one wallet ID is required' })
    @ArrayMaxSize(50, { message: 'Cannot delete more than 50 wallets at once' })
    wallet_ids: number[];
}
