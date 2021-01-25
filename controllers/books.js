const db = require('../db/mysql')

const uuid = require('uuid');

const fsPromises = require('fs').promises

const { bookValidator } = require('../validators/book')

const uploadBook = async (req, res) => {
    const { isbn, title, course, editorial, editionYear, price, detail } = req.body
    const decodedToken = req.auth

    try {
        await bookValidator.validateAsync(req.body)

        await db.uploadBook(isbn, title, course, editorial, editionYear, price, detail, decodedToken.id)

        const requests = await db.checkRequests(isbn)

        if (requests.length > 0) {
            const actives = requests.filter(user => user.active)
            for (let user of actives) {
                // utils.sendPetitionRequiredMail(email, isbn, title, `http://${process.env.PUBLIC_DOMAIN}/user/login`)
            }
        }

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

const uploadImageBook = async (req, res) => {
    const { id } = req.params
    const decodedToken = req.auth

    try {
        const book = await db.getBook(id)
        if (decodedToken.id !== book.id_user) {
            res.status(500).send()
            return
        }
        // si hiciese falta comprobar la extensión del fichero
        // podríamos hacerlo aquí a partir de la información de req.files
        // y enviar un error si no es el tipo que nos interesa (res.status(400).send())

        await fsPromises.mkdir(`${process.env.TARGET_FOLDER}/books`, { recursive: true })


        const fileID = uuid.v4()
        const outputFileName = `${process.env.TARGET_FOLDER}/books/${fileID}.jpg`

        await fsPromises.writeFile(outputFileName, req.files.image.data)

        // guardar una referencia a este UUID En la base de datos, de forma que
        // cuando nos pidan la lista de nuestros recursos (productos, conciertos, etc) o 
        // el detalle de uno de ellos, accedemos a la BBDD para leer los UUID, y después el
        // front llamará al GET con el UUID correspondiente
        await db.uploadImage(outputFileName, id)
        res.send(outputFileName)
    } catch (e) {
        console.log('Error: ', e)
        res.status(500).send()
    }
}

const updateBook = async (req, res) => {
    const { id } = req.params
    const { isbn, title, course, editorial, editionYear, price, detail } = req.body
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

const getPetitions = async (req, res) => {
    const decodedToken = req.auth

    try {
        const petitions = await db.getPetitionsOfUser(decodedToken.id)
        if (petitions.length !== 0) {
            res.send(petitions)
            return
        } else {
            res.send('No tienes peticiones')
        }

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
}

const setPetition = async (req, res) => {
    const decodedToken = req.auth
    const { isbn, petIndex } = req.body

    try {
        await db.setPetitionOfUser(decodedToken.id, isbn, petIndex)

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
    return
}

module.exports = {
    getPetitions,
    setPetition,
    updateBook,
    uploadBook,
    uploadImageBook
}