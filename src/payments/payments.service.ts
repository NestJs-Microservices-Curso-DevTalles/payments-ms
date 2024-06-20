import { Inject, Injectable, Logger } from '@nestjs/common';
import { NATS_SERVICE, envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {

    private readonly stripe = new Stripe(
        envs.stripeSecret
    );
    private readonly logger = new Logger('PaymentsService')

    constructor(
        @Inject(NATS_SERVICE) private readonly client: ClientProxy
    ) { }

    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
        const { currency, items, orderId } = paymentSessionDto;

        console.log('PaymentDto');

        console.log(paymentSessionDto);
        const lineItems = items.map((item) => {
            return {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100), // 20 dólares 2000 / 100 = 20.00 // 15.0000
                },
                quantity: item.quantity,
            };
        });

        // console.log('PaymentDto');

        // console.log(paymentSessionDto);
        // console.log(lineItems);
        const session = await this.stripe.checkout.sessions.create({
            //colocar id de la orden
            payment_intent_data: {
                metadata: {
                    orderId: orderId
                }
            },
            line_items: lineItems,
            mode: 'payment',
            success_url: envs.stripeSuccessUrl,
            cancel_url: envs.stripeCancelUrl,
        });
        // return session;
        return {
            cancelUrl: session.cancel_url,
            successUrl: session.success_url,
            url: session.url,
        }
    }

    async stripeWebhook(req: Request, res: Response) {
        // const endpointSecret = "whsec_PzHyanYRI5twgax9isp6BjRLGNcuHMfk";
        const endpointSecret = envs.stripeEndpointSecret;
        const sig = req.headers['stripe-signature'];

        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(req['rawBody'], sig, endpointSecret);
        } catch (error) {
            res.status(400).send(`Webhook Error: ${error.message}`);
            return;
        }
        // console.log({event});

        switch (event.type) {
            case 'charge.succeeded':
                const chargeSucceeded = event.data.object;
                //Llamar nuestro ms
                // console.log({
                //     metadata: chargeSucceeded.metadata,
                //     orderId: chargeSucceeded.metadata.orderId,
                // });
                const payload = {
                    stripePaymentId: chargeSucceeded.id,
                    orderId: chargeSucceeded.metadata.orderId,
                    receiptUrl: chargeSucceeded.receipt_url
                }
                // this.logger.log({payload: payload});
                this.client.emit('payment.succeeded', payload);
                break;
            default:
                // res.status(400).send(`Unhandled event type ${event.type}`);
                console.log(`Evemt ${event.type} not handle`);
        }
        return res.status(200).json(sig);
    }

}
