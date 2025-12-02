const pool = require('../config/database');
const logger = require('../middleware/logger');

// Wrapper seguro para operações com a BD
const withConnection = async (operation) => {
    const connection = await pool.getConnection();
    
    try {
        const result = await operation(connection);
        return result;
    } catch (error) {
        logger.error('Erro na operação de BD', error);
        throw error;
    } finally {
        connection.release();
    }
};

// Transação segura
const withTransaction = async (operation) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        const result = await operation(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        logger.error('Erro na transação', error);
        throw error;
    } finally {
        connection.release();
    }
};

// Helper para queries comuns
const databaseHelpers = {
    findOne: async (table, where, connection) => {
        const keys = Object.keys(where);
        const values = Object.values(where);
        const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
        
        const [rows] = await connection.execute(
            `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`,
            values
        );
        
        return rows[0] || null;
    },

    exists: async (table, where, connection) => {
        const record = await databaseHelpers.findOne(table, where, connection);
        return !!record;
    },

    insert: async (table, data, connection) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');
        
        const [result] = await connection.execute(
            `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
            values
        );
        
        return result;
    }
};

module.exports = {
    withConnection,
    withTransaction,
    ...databaseHelpers
};