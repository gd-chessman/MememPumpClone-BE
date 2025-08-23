import { Controller, Post, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { PhantomTradeService } from './services/phantom-trade.service';
import { CreateTransactionRequestDto } from './dto/create-transaction-request.dto';
import { SubmitSignedTransactionDto } from './dto/submit-signed-transaction.dto';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { CircuitBreakerGuard } from './guards/circuit-breaker.guard';

@Controller('phantom-trade')
export class PhantomTradeController {
    constructor(
        private readonly phantomTradeService: PhantomTradeService
    ) {}

    @Post('create-transaction')
    @UseGuards(RateLimitGuard, CircuitBreakerGuard)
    async createTransaction(@Body() createTransactionRequestDto: CreateTransactionRequestDto) {
        try {
            const result = await this.phantomTradeService.createTransaction(createTransactionRequestDto);

            if (result.status === HttpStatus.BAD_REQUEST) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.error,
                    message: result.message
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === HttpStatus.INTERNAL_SERVER_ERROR) {
                throw new HttpException({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: result.error,
                    message: result.message
                }, HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to create transaction'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('submit-signed-transaction')
    @UseGuards(RateLimitGuard, CircuitBreakerGuard)
    async submitSignedTransaction(@Body() submitSignedTransactionDto: SubmitSignedTransactionDto) {
        try {
            const result = await this.phantomTradeService.submitSignedTransaction(submitSignedTransactionDto);

            if (result.status === HttpStatus.BAD_REQUEST) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.error,
                    message: result.message
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === HttpStatus.NOT_FOUND) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.error,
                    message: result.message
                }, HttpStatus.NOT_FOUND);
            }

            if (result.status === HttpStatus.INTERNAL_SERVER_ERROR) {
                throw new HttpException({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: result.error,
                    message: result.message
                }, HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to submit signed transaction'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
