import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirdropListPool } from './entities/airdrop-list-pool.entity';
import { AirdropPoolJoin } from './entities/airdrop-pool-join.entity';
import { AirdropListToken } from './entities/airdrop-list-token.entity';
import { AirdropReward } from './entities/airdrop-reward.entity';
import { AirdropPoolRound } from './entities/airdrop-pool-round.entity';
import { AirdropRoundDetail } from './entities/airdrop-round-detail.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AirdropListPool,
      AirdropPoolJoin,
      AirdropListToken,
      AirdropReward,
      AirdropPoolRound,
      AirdropRoundDetail,
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AirdropsModule {} 