import { ApiProperty } from '@nestjs/swagger';

export class WalletItemDto {
    @ApiProperty({
        description: 'ID của ví',
        example: 3251125
    })
    wallet_id: number;

    @ApiProperty({
        description: 'Loại ví (main, other, import)',
        example: 'main'
    })
    wallet_type: string;

    @ApiProperty({
        description: 'Tên ví',
        example: 'Ví trading',
        nullable: true
    })
    wallet_name: string | null;

    @ApiProperty({
        description: 'Nickname của ví',
        example: 'nickname_01',
        nullable: true
    })
    wallet_nick_name: string | null;

    @ApiProperty({
        description: 'Quốc gia của ví',
        example: 'VN',
        nullable: true
    })
    wallet_country: string | null;

    @ApiProperty({
        description: 'Địa chỉ Solana',
        example: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
        nullable: true
    })
    solana_address: string | null;

    @ApiProperty({
        description: 'Địa chỉ Ethereum',
        example: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        nullable: true
    })
    eth_address: string | null;

    @ApiProperty({
        description: 'Quyền hạn của ví (member, admin, ...)',
        example: 'member'
    })
    wallet_auth: string;

    @ApiProperty({
        description: 'Số dư SOL',
        example: 1.5,
        nullable: true
    })
    solana_balance: number | null;

    @ApiProperty({
        description: 'Số dư SOL tính bằng USD',
        example: 150.75,
        nullable: true
    })
    solana_balance_usd: number | null;
}

export class GetMyWalletsResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Danh sách ví của người dùng',
        type: [WalletItemDto]
    })
    data: WalletItemDto[];
} 