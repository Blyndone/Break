import { Break } from '../apps/break.js'
import { BreakResults } from '../apps/results.js'

const BREAK_MODULE_NAME = 'break'

let breakUI
let breakResults
let socket

export async function preloadHandlebarsTemplates() {
  const partials = ['modules/break/templates/prompt.hbs', 'modules/break/templates/results.hbs']

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

/**
 * `/break` starts a round, `/break <text>` sets the prompt shown to players.
 * Returning false stops the command being posted as a chat message.
 */
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  const match = message.match(/^\/break(?:\s+([\s\S]+))?$/i)
  if (!match) return true

  if (!game.user.isGM) {
    ui.notifications.warn('Only a GM can start a buzzer round.')
    return false
  }

  const text = match[1]?.trim()
  breakResults?.start(text ? { text } : {})
  return false
})

Hooks.once('socketlib.ready', () => {
  // Every client registers the same handlers; socketlib routes by name.
  socket = socketlib.registerModule(BREAK_MODULE_NAME)

  socket.register('showPrompt', (prompt) => breakUI?.show(prompt))
  socket.register('dismissPrompt', (promptId) => breakUI?.dismiss(promptId))
  socket.register('buzz', (response) => breakResults?.record(response))
})

Hooks.once('ready', async function () {
  if (!game.modules.get('socketlib')?.active) {
    if (game.user.isGM) {
      ui.notifications.error(
        "Break requires the 'socketlib' module. Please install and activate it.",
      )
    }
    return
  }

  if (!game.settings.get(BREAK_MODULE_NAME, 'enable')) return

  breakUI = new Break({ socket })

  // Buzzes are addressed to the GM that opened the prompt, so every GM client
  // needs its own collector.
  if (game.user.isGM) breakResults = new BreakResults({ socket })

  game.modules.get(BREAK_MODULE_NAME).api = {
    /**
     * Prompt every other connected user and open the results window.
     * @param {object} [options]
     * @param {string} [options.text]  Message shown to players.
     */
    prompt: (options) => breakResults?.start(options),
    /** End the current round and close every overlay. */
    dismiss: () => breakResults?.dismiss(),
  }
})
