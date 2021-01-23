const jwt = require('jsonwebtoken');

const db = require('../db/mysql')

const isAuthenticated = async (req, res, next) => {
    // obtenemos el token que habrán metido en 
    // la cabecera
    const { authorization } = req.headers;
    
    try {
        // si la verificación del token falla (caducado, mal formado, no descifrable
        // con el SECRET dado) salta una excepción
        const decodedToken = jwt.verify(authorization, process.env.SECRET);

        const user = await db.getUser(decodedToken.email)

        if (!user) {
            throw new Error()
        }
        console.log(decodedToken)
        req.auth = decodedToken;
    } catch (e) {
        res.status(401).send()
        return

        //        const authError = new Error('invalid token');
        //        authError.status = 401;
        //        return next(authError);
    }

    next();
}

module.exports = {
    isAuthenticated
};