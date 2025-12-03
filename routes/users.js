const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const router = express.Router();

/* ======================================================
    LOGGING SIMPLES E ROBUSTO
====================================================== */
const log = {
    info: (msg) => console.log(`ℹ️ USERS: ${msg}`),
    error: (msg, err) => {
        console.error(`❌ USERS ERROR: ${msg}`);
        if (err) console.error("   Detalhes:", err.message);
    },
    warn: (msg) => console.log(`⚠️ USERS: ${msg}`)
};

/* ======================================================
    MIDDLEWARE DE AUTENTICAÇÃO JWT
====================================================== */
const authRequired = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'Token não fornecido' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // id, email, perfil, nome
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

/* ======================================================
    1️⃣ REGISTRO
====================================================== */
router.post('/registro', async (req, res) => {
    try {
        const { nome, email, password, telefone, perfil } = req.body;

        if (!nome || !email || !password)
            return res.status(400).json({ error: "Campos obrigatórios faltando" });

        // Verificar se email já existe
        const [exist] = await db.execute(
            "SELECT id FROM usuarios WHERE email = ?",
            [email]
        );

        if (exist.length > 0)
            return res.status(409).json({ error: "Email já registrado" });

        const hashed = await bcrypt.hash(password, 10);

        const query = `
            INSERT INTO usuarios (nome, email, senha_hash, telefone, perfil)
            VALUES (?, ?, ?, ?, ?)
        `;
        await db.execute(query, [nome, email, hashed, telefone, perfil || "usuario"]);

        res.json({
            success: true,
            message: "Usuário registrado com sucesso"
        });

    } catch (err) {
        log.error("Erro ao registrar usuário", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

/* ======================================================
    2️⃣ LOGIN
====================================================== */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await db.execute(
            "SELECT * FROM usuarios WHERE email = ?",
            [email]
        );

        if (rows.length === 0)
            return res.status(401).json({ error: "Credenciais inválidas" });

        const user = rows[0];

        const valid = await bcrypt.compare(password, user.senha_hash);
        if (!valid)
            return res.status(401).json({ error: "Credenciais inválidas" });

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                perfil: user.perfil,
                nome: user.nome
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        delete user.senha_hash;

        res.json({ success: true, token, user });

    } catch (err) {
        log.error("Erro no login", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

/* ======================================================
    3️⃣ VERIFICAR TOKEN
====================================================== */
router.get('/verify', authRequired, async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT id, nome, email, perfil, telefone FROM usuarios WHERE id = ?",
            [req.user.id]
        );

        if (rows.length === 0)
            return res.status(404).json({ error: "Usuário não encontrado" });

        res.json({ valid: true, user: rows[0] });

    } catch (err) {
        log.error("Erro ao verificar token", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

/* ======================================================
    4️⃣ LOGOUT (stateless)
====================================================== */
router.post('/logout', (_req, res) => {
    res.json({ success: true, message: "Logout efetuado" });
});

/* ======================================================
    5️⃣ LISTAR TODOS USUÁRIOS
====================================================== */
router.get('/', authRequired, async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT id, nome, email, perfil, telefone FROM usuarios ORDER BY id DESC"
        );
        res.json(rows);
    } catch (err) {
        log.error("Erro ao listar usuários", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

/* ======================================================
    6️⃣ OBTER USUÁRIO POR ID
====================================================== */
router.get('/:id', authRequired, async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT id, nome, email, perfil, telefone FROM usuarios WHERE id = ?",
            [req.params.id]
        );

        if (rows.length === 0)
            return res.status(404).json({ error: "Usuário não encontrado" });

        res.json(rows[0]);

    } catch (err) {
        log.error("Erro ao buscar usuário", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

/* ======================================================
    7️⃣ ATUALIZAR USUÁRIO
====================================================== */
router.put('/:id', authRequired, async (req, res) => {
    try {
        const { nome, telefone, perfil } = req.body;

        await db.execute(
            "UPDATE usuarios SET nome=?, telefone=?, perfil=? WHERE id=?",
            [nome, telefone, perfil, req.params.id]
        );

        res.json({ success: true, message: "Atualizado com sucesso" });

    } catch (err) {
        log.error("Erro ao atualizar usuário", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

/* ======================================================
    8️⃣ APAGAR USUÁRIO
====================================================== */
router.delete('/:id', authRequired, async (req, res) => {
    try {
        await db.execute("DELETE FROM usuarios WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Usuário removido" });
    } catch (err) {
        log.error("Erro ao remover usuário", err);
        res.status(500).json({ error: "Erro interno" });
    }
});


module.exports = router;
