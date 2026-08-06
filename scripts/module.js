import { Break } from '../apps/break.js'

const BREAK_MODULE_NAME = 'break'

let breakUI
let socket

export async function preloadHandlebarsTemplates() {
  const partials = ['modules/break/templates/prompt.hbs']

  const paths = {}
  for (const path of partials) {
    paths[path.replace('.hbs', '.html')] = path
    paths[`BREAK.${path.split('/').pop().replace('.hbs', '')}`] = path
  }

  return foundry.applications.handlebars.loadTemplates(paths)
}

Hooks.once('init', async function () {
  preloadHandlebarsTemplates()

  game.settings.register(BREAK_MODULE_NAME, 'enable', {
    name: 'Enabled',
    hint: 'Enable or disable the buzzer prompt on this client',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  })
})

Hooks.once('socketlib.ready', () => {
  socket = socketlib.registerModule(BREAK_MODULE_NAME)

  // TODO: register the prompt/buzz handlers once the protocol is settled.
  // socket.register('showPrompt', (prompt) => breakUI?.show(prompt))
  // socket.register('dismissPrompt', () => breakUI?.dismiss())
  // socket.register('buzz', (response) => { /* GM side ordering */ })
})

Hooks.once('ready', async function () {
  if (!game.modules.get('socketlib')?.active && game.user.isGM) {
    ui.notifications.error(
      "Break requires the 'socketlib' module. Please install and activate it.",
    )
    return
  }

  if (!game.settings.get(BREAK_MODULE_NAME, 'enable')) return

  breakUI = new Break({ socket })
})
