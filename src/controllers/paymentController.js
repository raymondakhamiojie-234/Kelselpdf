const pool = require('../config/db');

exports.getPayment = (req, res) => {
    res.render('acct/payment', { 
        user: req.session.user,
        paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_4ede74cd265890e05a92b2962578636590b18913',
        locked: req.query.locked === 'true'
    });
};

exports.verifyPayment = async (req, res) => {
    try {
        const reference = req.body.reference;
        const plan = req.body.plan || 'premium';
        
        if (!reference) {
            return res.json({ status: 'error', message: 'No reference supplied' });
        }

        const paystack_secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_cf6c6d149cc80889c10fd94552cc29e8e500b2c3';

        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${paystack_secret}`,
                "Cache-Control": "no-cache"
            }
        });

        const tranx = await response.json();
        
        if (!tranx.status || tranx.data.status !== 'success') {
            return res.json({ status: 'error', message: 'Payment verification failed on Paystack.' });
        }

        const user_id = req.session.user.id;
        let expiry_date;
        let plan_name;

        if (plan === 'full_premium') {
            const date = new Date();
            date.setMonth(date.getMonth() + 6);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Full Premium';
        } else {
            const date = new Date();
            date.setMonth(date.getMonth() + 3);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Premium';
        }

        await pool.query(
            'UPDATE users SET has_paid = 1, expiry_date = ?, subscription_plan = ?, can_change_level = 1, account_locked = 0 WHERE id = ?',
            [expiry_date, plan_name, user_id]
        );

        const amount_paid = tranx.data.amount ? (tranx.data.amount / 100) : 0;
        await pool.query(
            'INSERT INTO transactions (user_id, reference, plan, amount) VALUES (?, ?, ?, ?)',
            [user_id, reference, plan_name, amount_paid]
        );

        // Update session
        req.session.user.has_paid = 1;
        req.session.user.expiry_date = expiry_date;
        req.session.user.subscription_plan = plan_name;
        req.session.user.account_locked = 0;

        res.json({ status: 'success' });
    } catch (err) {
        console.error(err);
        res.json({ status: 'error', message: err.message });
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const [transactions] = await pool.query(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
            [req.session.user.id]
        );
        res.render('acct/payment_history', { transactions });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
