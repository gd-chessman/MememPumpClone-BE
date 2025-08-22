import { ApiProperty } from '@nestjs/swagger';

export class DeleteMultipleWalletsResponseDto {
    @ApiProperty({
        description: 'Status code',
        example: 200
    })
    status: number;

    @ApiProperty({
        description: 'Response message',
        example: 'Bulk wallet deletion completed'
    })
    message: string;

    @ApiProperty({
        description: 'Total wallets processed',
        example: 10
    })
    total_processed: number;

    @ApiProperty({
        description: 'Number of successfully deleted wallets',
        example: 8
    })
    success_count: number;

    @ApiProperty({
        description: 'Number of failed deletions',
        example: 2
    })
    failed_count: number;

    @ApiProperty({
        description: 'Successfully deleted wallets',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                wallet_id: { type: 'number' },
                wallet_type: { type: 'string' },
                wallet_name: { type: 'string' },
                solana_address: { type: 'string' },
                eth_address: { type: 'string' }
            }
        }
    })
    success_wallets: Array<{
        wallet_id: number;
        wallet_type: string;
        wallet_name: string | null;
        solana_address: string | null;
        eth_address: string | null;
    }>;

    @ApiProperty({
        description: 'Failed wallet deletions with reasons',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                wallet_id: { type: 'number' },
                reason: { type: 'string' }
            }
        }
    })
    failed_wallets: Array<{
        wallet_id: number;
        reason: string;
    }>;
}
