import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TradingOrder } from 'src/trade/entities/trading-order.entity';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
    private telegramBotToken: string;
    private discordWebhook: string;
    private workerUrl: string;

    constructor(private configService: ConfigService) {
        this.telegramBotToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
        this.discordWebhook = this.configService.get<string>('DISCORD_WEBHOOK_URL') || '';
        this.workerUrl = this.configService.get<string>('URL_WORKER', 'https://proxy.michosso2025.workers.dev');
    }

    async sendTelegramMessage(chatId: string, message: string) {
        try {
            const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
            await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Error sending Telegram message:', error);
        }
    }

    async sendDiscordMessage(message: string) {
        try {
            await axios.post(this.discordWebhook, {
                content: message
            });
        } catch (error) {
            console.error('Error sending Discord message:', error);
        }
    }

    async notifyNewTransaction(transactionDetail: any) {
        const message = this.formatTransactionMessage(transactionDetail);

        // Gửi đến cả Telegram và Discord
        if (transactionDetail.telegram_chat_id) {
            await this.sendTelegramMessage(
                transactionDetail.telegram_chat_id,
                message
            );
        }

        await this.sendDiscordMessage(message);
    }

    async notifyNewOrder(order: TradingOrder) {
        const message = `New ${order.order_trade_type} order created:
        Token: ${order.order_token_name}
        Amount: ${order.order_qlty}
        Price: ${order.order_price}
        Type: ${order.order_type}`;

        if (order.wallet?.wallet_id) {
            await this.sendTelegramMessage(
                order.wallet.wallet_id.toString(),
                message
            );
        }

        await this.sendDiscordMessage(message);
    }

    private formatTransactionMessage(detail: any): string {
        return `
🔄 New Master Trading Transaction

Type: ${detail.mt_detail_type.toUpperCase()}
Token: ${detail.mt_detail_token_name}
Amount: ${detail.mt_detail_amount} SOL
Price: $${detail.mt_detail_price}
Total: $${detail.mt_detail_total_usd}
Status: ${detail.mt_detail_status.toUpperCase()}
${detail.mt_detail_hash ? `\nTx Hash: ${detail.mt_detail_hash}` : ''}
        `.trim();
    }

    async sendMasterTradeNotification(
        telegramId: string,
        tradeInfo: {
            type: 'buy' | 'sell',
            token: string,
            amount: number,
            price: number,
            total: number,
            txHash: string
        }
    ) {
        try {
            const message = `Master Trade ${tradeInfo.type.toUpperCase()}: ${tradeInfo.amount} ${tradeInfo.token} at ${tradeInfo.price} SOL (Total: ${tradeInfo.total} SOL)`;

            await this.sendTelegramMessage(telegramId, message);
            await this.sendDiscordMessage(message);

            return true;
        } catch (error) {
            console.error('Error sending master trade notification:', error);
            return false;
        }
    }

    async sendVerificationCode(chatId: string, code: string) {
        try {
            const message = `
🔐 Password Reset Verification Code

Your verification code is: <b>${code}</b>

Please use this code to reset your password.
This code will expire in 5 minutes.

⚠️ Do not share this code with anyone.
            `.trim();

            const url = `${this.workerUrl}/bot${this.telegramBotToken}/sendMessage`
            await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });
            return true;
        } catch (error) {
            console.error('Error sending verification code:', error);
            return false;
        }
    }

    async sendPasswordResetCodeEmail(to: string, code: string): Promise<void> {
        const smtpHost = this.configService.get<string>('SMTP_HOST');
        const smtpPort = this.configService.get<number>('SMTP_PORT');
        const smtpUser = this.configService.get<string>('SMTP_USER');
        const smtpPass = this.configService.get<string>('SMTP_PASS');
        const fromName = this.configService.get<string>('SMTP_FROM_NAME') || 'Memepump';
        const fromEmail = this.configService.get<string>('SMTP_FROM') || smtpUser;

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
            throw new Error('SMTP configuration is missing in environment variables');
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for 465, false for other ports
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        const subject = 'Password Reset Code';
        const body = `Your password reset code is: ${code}\n\nThis code will expire in 3 minutes.\nIf you did not request a password reset, please ignore this email.`;

        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            text: body,
        });
    }
} 