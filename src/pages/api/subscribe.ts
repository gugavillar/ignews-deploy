/* eslint-disable import/no-anonymous-default-export */
import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "next-auth/client";
import { stripe } from '../../services/stripe';
import { fauna } from '../../services/fauna';
import { query as q } from 'faunadb';

interface User {
    ref: {
        id: string;
    }
    data: {
        stripe_customer_id: string;
    }
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const session = await getSession({ req });

        const user = await fauna.query<User>(
            q.Get(
                q.Match(
                    q.Index('user_by_email'),
                    q.Casefold(session.user.email)
                )
            )
        );

        let customerId = user.data.stripe_customer_id;
        if (!customerId) {
            const stripeCustomerCreate = await stripe.customers.create({
                email: session.user.email
            });

            await fauna.query(
                q.Update(
                    q.Ref(q.Collection('users'), user.ref.id),
                    {
                        data: {
                            stripe_customer_id: stripeCustomerCreate.id
                        }
                    }
                )
            )

            customerId = stripeCustomerCreate.id;
        }

        const stripeCheckoutSession = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                { price: 'price_1JFeluDIQJm4ZyNcjGVMYi5A', quantity: 1 }
            ],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url: process.env.STRIPE_SUCCESS_URL,
            cancel_url: process.env.STRIPE_CANCEL_URL
        });
        return res.status(200).json({ sessionId: stripeCheckoutSession.id });
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed');
    }
}