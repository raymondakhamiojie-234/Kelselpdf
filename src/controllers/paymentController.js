const pool = require('../config/db');

exports.getPayment = async (req, res) => {
    try {
        const userId = req.session.user_id || (req.session.user && req.session.user.id);
        let user = req.session.user || {};
        if (userId && (!user.email || !user.full_name)) {
            const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            if (rows.length > 0) {
                user = rows[0];
                req.session.user = user;
            }
        }
        res.render('acct/payment', { 
            user,
            paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_4ede74cd265890e05a92b2962578636590b18913',
            locked: req.query.locked === 'true',
            active_page: 'billing'
        });
    } catch (err) {
        console.error("getPayment error:", err);
        res.render('acct/payment', { 
            user: req.session.user || {},
            paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_4ede74cd265890e05a92b2962578636590b18913',
            locked: req.query.locked === 'true',
            active_page: 'billing'
        });
    }
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

        const user_id = (req.session.user && req.session.user.id) || req.session.user_id;
        let expiry_date;
        let plan_name;

        if (plan === 'full_premium') {
            const date = new Date();
            date.setMonth(date.getMonth() + 6);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Full Premium';
        } else {
            const date = new Date();
            date.setMonth(date.getMonth() + 1);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Premium';
        }

        await pool.query(
            'UPDATE users SET has_paid = true, expiry_date = ?, subscription_plan = ?, can_change_level = true, account_locked = false WHERE id = ?',
            [expiry_date, plan_name, user_id]
        );

        const amount_paid = tranx.data.amount ? (tranx.data.amount / 100) : 0;
        try {
            await pool.query(
                'INSERT INTO transactions (user_id, reference, plan, amount) VALUES (?, ?, ?, ?)',
                [user_id, reference, plan_name, amount_paid]
            );
        } catch (trxErr) {
            console.error("Failed to insert transaction record:", trxErr);
            // We don't want to fail the whole payment just because the log failed
        }

        // Update session cleanly
        req.session.user = {
            ...req.session.user,
            has_paid: 1,
            expiry_date: expiry_date,
            subscription_plan: plan_name,
            account_locked: 0
        };

        res.json({ status: 'success' });
    } catch (err) {
        console.error(err);
        res.json({ status: 'error', message: err.message });
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const user_id = (req.session.user && req.session.user.id) || req.session.user_id;
        const [transactions] = await pool.query(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
            [user_id]
        );
        res.render('acct/payment_history', { transactions, active_page: 'billing' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
