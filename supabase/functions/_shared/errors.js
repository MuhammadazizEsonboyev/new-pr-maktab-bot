/** Foydalanuvchiga ko'rsatiladigan xato: status — HTTP kodi, extra — javobga qo'shiladigan maydonlar */
export class HttpError extends Error {
  constructor(status, message, extra = null) {
    super(message)
    this.status = status
    this.extra = extra
  }
}
