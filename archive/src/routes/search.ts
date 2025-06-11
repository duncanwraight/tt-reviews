import { Hono } from 'hono'
import { SearchController } from '../controllers/search.controller'

const search = new Hono()

search.get('/', SearchController.search)

export { search }
