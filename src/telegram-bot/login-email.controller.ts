import { Controller, Post, Body, BadRequestException, Logger, Req } from '@nestjs/common';
import { Request } from 'express';
import { LoginEmailService, GoogleLoginDto, LoginResponse } from './login-email.service';

@Controller('login-email')
export class LoginEmailController {
    private readonly logger = new Logger(LoginEmailController.name);

    constructor(
        private readonly loginEmailService: LoginEmailService,
    ) {}

    @Post()
    async loginWithEmail(@Body() googleData: GoogleLoginDto, @Req() req: Request): Promise<LoginResponse> {
        try {
            this.logger.log(`Received login request for email: ${googleData.code}`);
            return await this.loginEmailService.handleGoogleLogin(googleData, req);
        } catch (error) {
            this.logger.error(`Error in loginWithEmail: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Login failed',
                error: 'Bad Request'
            });
        }
    }
} 