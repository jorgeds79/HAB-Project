const db = require('../db/mysql')

const { bookValidator } = require('../validators/book')

const uploadBook = async (req, res) => {
    const {isbn, title, course, editorial, editionYear, price, detail} = req.body
    const decodedToken = req.auth

    console.log(isbn)

    try {
        await bookValidator.validateAsync(req.body)
        
        await db.uploadBook(isbn, title, course, editorial, editionYear, price, detail, decodedToken.id)

        // const requests = await db.checkRequests(isbn)
        // if (requests.length > 0) {
        //     for (let request of requests)
        // }
        // console.log(requests)

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send()
}

const updateBook = async (req, res) => {
    const { id } = req.params
    const {isbn, title, course, editorial, editionYear, price, detail} = req.body
    const decodedToken = req.auth

    try {
        await bookValidator.validateAsync(req.body)

        const book = await db.getBook(id)

        if (decodedToken.id !== book.id_user) {
            res.status(500).send()
            return
        }

        await db.updateBook(isbn, title, course, editorial, editionYear, price, detail, id)

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send('Datos actualizados correctamente')
}

module.exports = {
    updateBook,
    uploadBook
}