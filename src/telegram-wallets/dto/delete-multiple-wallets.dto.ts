import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, ArrayMinSize } from 'class-validator';

export class DeleteMultipleWalletsDto {
    @ApiProperty({
        description: 'Array of wallet IDs to delete',
        example: [123, 456, 789],
        type: [Number],
        minimum: 1
    })
    @IsArray()
    @IsNumber({}, { each: true })
    @ArrayMinSize(1, { message: 'At least one wallet ID is required' })
    wallet_ids: number[];
}
