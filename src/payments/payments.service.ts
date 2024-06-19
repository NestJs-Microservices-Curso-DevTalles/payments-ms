import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {

    private readonly stripe = new Stripe(
        envs.stripeSecret
    );

    async createPaymentSession(paymentSessionDto: PaymentSessionDto){
        const {currency,items,orderId}=paymentSessionDto;
        const lineItems = items.map(item => {
            return{
                price_data:{
                    currency,
                    product_data:{
                        name: item.name
                    },
                    unit_amount: Math.round(item.price*100)
                },
                quantity: item.quantity
            }
        });
        const session = await this.stripe.checkout.sessions.create({
            //colocar id de la orden
            payment_intent_data:{
                metadata: {
                    orderId: orderId
                }
            },
            line_items:lineItems,
            mode: 'payment',
            success_url: envs.stripeSuccessUrl,
            cancel_url: envs.stripeCancelUrl,
        });
        return session;
    }

    async stripeWebhook(req:Request,res:Response){
        // const endpointSecret = "whsec_PzHyanYRI5twgax9isp6BjRLGNcuHMfk";
        const endpointSecret = envs.stripeEndpointSecret;
        const sig = req.headers['stripe-signature'];

        let event:Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(req['rawBody'],sig,endpointSecret);
        } catch (error) {
            res.status(400).send(`Webhook Error: ${error.message}`);
            return;
        }
        // console.log({event});

        switch(event.type) {
            case 'charge.succeeded':
                const chargeSucceeded = event.data.object;
                //Llamar nuestro ms
                console.log({
                    metadata:chargeSucceeded.metadata,
                    orderId:chargeSucceeded.metadata.orderId,
                });

                break;
            default:
                res.status(400).send(`Unhandled event type ${event.type}`);
                return;
        }
        return  res.status(200).json(sig);
    }

}
