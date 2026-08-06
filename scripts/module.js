import { Break } from '../apps/break.js'
import { BreakResults } from '../apps/results.js'

const BREAK_MODULE_NAME = 'break'

let breakUI
let breakResults
let socket

export async function preloadHandlebarsTemplates() {
  const partials = [
    'modules/break/templates/prompt.hbs',
    'modules/break/templates/results.hbs',
    'modules/break/templates/chat-results.hbs',
  ]

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

  game.settings.register(BREAK_MODULE_NAME, 'duration', {
    name: 'Response Time',
    hint: 'Seconds players have to break in before the round closes. Set to 0 for no time limit.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 60, step: 1 },
    default: 5,
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

  // A leading integer is the cap on accepted responses; everything after it
  // is the prompt text. `/break 3 zombies` caps at 3, `/break zombies` does not.
  const args = match[1]?.trim() ?? ''
  const capped = args.match(/^(\d+)(?:\s+([\s\S]+))?$/)

  const limit = capped ? Number(capped[1]) : null
  const text = (capped ? capped[2] : args)?.trim()

  if (limit != null && limit < 1) {
    ui.notifications.warn('Break | The response limit must be at least 1.')
    return false
  }

  breakResults?.start({ ...(text ? { text } : {}), limit })
  return false
})

Hooks.once('socketlib.ready', () => {
  // Every client registers the same handlers; socketlib routes by name.
  socket = socketlib.registerModule(BREAK_MODULE_NAME)

  socket.register('showPrompt', (prompt) => breakUI?.show(prompt))
  socket.register('dismissPrompt', (promptId) => breakUI?.dismiss(promptId))
  socket.register('syncStatus', (update) => breakUI?.sync(update))
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
