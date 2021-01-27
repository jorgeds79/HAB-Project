const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const randomstring = require("randomstring");
const uuid = require('uuid');
const fsPromises = require('fs').promises


const db = require('../db/mysql')
const utils = require('../utils/utils')

const { authValidator } = require('../validators/auth')
const { emailValidator } = require('../validators/email')
const { logValidator } = require('../validators/log')
const { newPassValidator } = require('../validators/newPass')
const { passValidator } = require('../validators/pass')
const { updateProfileValidator } = require('../validators/updateProfile')


const register = async (req, res) => {
    // comprobar que nos pasan los campos requeridos
    // (como mínimo serán email y password pero pueder ser
    // cualquiera que haga falta en vuestro proyecto)

    // almacenaremos el usuario en BBDD
    // con la password encriptada (con bcrypt)
    // para que nunca se sepa cuál era la password original
    
    try {
        console.log(req.body)
        await authValidator.validateAsync(req.body)
                        
        // En una aplicación más grande, se podría incluir
        // más información del usuario (nombre real, dirección
        // postal, etc)
        const { name, surnames, address, location, phone, email, password } = req.body

        const passwordBcrypt = await bcrypt.hash(password, 10);

        // Generamos un string aleatorio para identificar a este usuario
        // únicamente a efectos de validación
        const validationCode = randomstring.generate(40);

        // Comprobamos aquí si ya existe un usuario con ese
        // email y que no esté validado (activo), ya que si existe y se 
        // encuentra sin validar debe permitir el registro 

        const user = await db.getUser(email)
        console.log(user)

        if (user && user.active) {
            res.status(401).send()
            return
        }

        let preCreated = false

        if (user && !user.active) {
            preCreated = true
        }        

        await db.register(name, surnames, address, location, phone, email, passwordBcrypt, validationCode, preCreated)
        
        // Enviar un correo eléctronico: si el usuario
        // de verdad es quien dice ser, podrá acceder a dicho correo
        // utils.sendConfirmationMail(email, `http://${process.env.PUBLIC_DOMAIN}/user/validate/${validationCode}`)

    } catch (e) {
        res.status(400).send()
        return
    }

    res.send()
}

const validateRegister = async (req, res) => {
    // http://ip:puerto/user/validate/lkj414j234lkj23142134lk2j34lñk2j42334
    const { code } = req.params;

    try {
        const email = await db.checkValidationCode(code)
        // enviamos email de confirmación
        // si se valida correctamente
        if (email) {
            // utils.sendVerificationMail(email, `http://${process.env.PUBLIC_DOMAIN}/user/login`)
        }
        res.send('Validado correctamente')
    } catch(e) {
        res.status(401).send('Usuario no validado')
    }
}

const login = async (req, res) => {
    // validar username y password:
    //    - comprobar que están en BBDD y coinciden
    const { email, password} = req.body

    // Validamos que el formato de los datos
    // de entrada es correcta. Si no es correcta
    // ya no realizamos la consulta a BBDD (no es 
    // estrictamente imprescindible ya que las
    // validaciones que vienen a continuación
    // fallarán si no existen email o password)
    try {
        await logValidator.validateAsync(req.body)
    } catch(e) {
        res.status(401).send('Usuario y/o contraseña incorrectos')
        return
    }
    
    const user = await db.getUser(email)
    console.log(user)

    if (!user) {
        res.status(401).send()
        return
    }

    if (!user.active) {
        res.status(401).send()
        return
    }

    // comprobar la password (ojo! con bcrypt)
    // error si no matchean
    const passwordIsvalid = await bcrypt.compare(password, user.password);

    if (!passwordIsvalid) {
        res.status(401).send()
        return
    }

    // metemos cualquier tipo de información que pueda
    // ser de utilidad en los controladores
    const tokenPayload = {
        id: user.id,
        name: user.name,
        surnames: user.surnames,
        email: user.email
    }

    // generamos el token a partir del objeto anterior con la librería jsonwebtoken
    // homework: probar caducidades de token más pequeñas y probar que el middleware
    // isAuthenticated no valida el token en esos casos
    const token = jwt.sign(tokenPayload, process.env.SECRET, {
        expiresIn: "1d"
    });

    res.json({
        token
    })
}

const updateUserPassword = async (req, res) => {
    // Comprobar sintaxis de los parámetros (vieja password (1234) y la nueva password (123456))
    
    const { password, newPassword, repeatNewPassword} = req.body
    // Comprobar que la vieja es correcta
    const decodedToken = req.auth
    
    if (newPassword !== repeatNewPassword) {
        res.status(400).send('Los datos introducidos son incorrectos')
        return
    }

    try {
        await passValidator.validateAsync(req.body)
    } catch(e) {
        res.status(400).send('Validacion erronea')
        return
    }

    // comprobar la password correspondiente
    // al usuario del token (ojo! con bcrypt)
    // error si no matchean
    const user = await db.getUser(decodedToken.email)
    const passwordIsvalid = await bcrypt.compare(password, user.password);

    if (!passwordIsvalid) {
        res.status(401).send()
        return
    }

    // Ciframos la nueva password
    const passwordBcrypt = await bcrypt.hash(newPassword, 10);

    // Actualizar vieja password con la nueva cifrada
    await db.updatePassword(user.id, passwordBcrypt)

    res.send()
}

const recoverPassword = async (req, res) => {
    // Comprobar que el formato del email es correcto
    const { email } = req.body
    
    try {
        await emailValidator.validateAsync(req.body)
    } catch(e) {
        res.status(400).send('Email incorrecto')
        return
    }
    
    // comprobar que el email se corresponde
    // a un usuario activo en BBDD
    // Si el usuario existe (y está activado)
    // enviamos email con link para recuperar
    // la contraseña
    const user = await db.getUser(email)
         
    if (user && user.active) {
        const validationCode = randomstring.generate(40);
        await db.updateValidationCode(email, validationCode)
        // utils.sendRecoverPasswordMail(email, `http://${process.env.PUBLIC_DOMAIN}/user/password/reset/${validationCode}`)
    } else {
        res.status(400).send('Email incorrecto')
        return
    }

    res.send('Se ha enviado un correo al email indicado para recuperar la contraseña')
}

const goToUpdatePassword = async (req, res) => {
    // http://ip:puerto/user/password/reset/lkj414j234lkj23142134lk2j34lñk2j42334
    const { code } = req.params;

    try {
        const user = await db.checkValidationCodeForPassword(code)
        
        if (user) {
            // go to redireccion a otro endpoint con el user.id en 
            // req.params, donde se introducirá la contraseña dos veces
        }
        res.send()
    } catch(e) {
        res.status(401).send('Usuario no validado')
    }
}

const updateRecoveredPassword = async (req, res) => {
    const { id } = req.params
    const { newPassword, repeatNewPassword } = req.body
        
    try {
        await newPassValidator.validateAsync(req.body)
    } catch(e) {
        res.status(400).send('Los datos introducidos son incorrectos')
        return
    }

    const user = await db.getUserById(id)
    // Ciframos la nueva password
    const passwordBcrypt = await bcrypt.hash(newPassword, 10);
    // Actualizar vieja password con la nueva cifrada
    await db.updatePassword(id, passwordBcrypt)
    // utils.sendRecoveredPasswordMail(user.email, `http://${process.env.PUBLIC_DOMAIN}/user/login`)

    res.send('Contraseña actualizada correctamente')
}

const updateProfile = async (req, res) => {
    const { id } = req.params
    const decodedToken = req.auth
    const { name, surnames, address, location, phone } = req.body
       
    try {
        
        await updateProfileValidator.validateAsync(req.body)
        const user = await db.getUserById(id)
           
        if (decodedToken.id !== user.id || !user.active) {
            res.status(400).send()
            return
        }

        await db.updateProfile(name, surnames, address, location, phone, id)

        if (req.files) {
            // si hiciese falta comprobar la extensión del fichero
            // podríamos hacerlo aquí a partir de la información de req.files
            // y enviar un error si no es el tipo que nos interesa (res.status(400).send())

            await fsPromises.mkdir(`${process.env.TARGET_FOLDER}/profiles`, { recursive: true })


            const fileID = uuid.v4()
            const outputFileName = `${process.env.TARGET_FOLDER}/profiles/${fileID}.jpg`

            await fsPromises.writeFile(outputFileName, req.files.image.data)

            // guardar una referencia a este UUID En la base de datos, de forma que
            // cuando nos pidan la lista de nuestros recursos (productos, conciertos, etc) o 
            // el detalle de uno de ellos, accedemos a la BBDD para leer los UUID, y después el
            // front llamará al GET con el UUID correspondiente
            await db.uploadProfilePhoto(outputFileName, decodedToken.id)
        }
    
    } catch (e) {
        res.status(400).send()
        return
    }

    res.send()
}



module.exports = {
    goToUpdatePassword,
    login,
    recoverPassword,
    register,
    updateProfile,
    updateRecoveredPassword,
    updateUserPassword,
    validateRegister   
}