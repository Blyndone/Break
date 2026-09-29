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
 * Parse the arguments of a `/break` invocation and start a round.
 *
 * A leading integer is the cap on accepted responses; everything after it is
 * the prompt text. `/break 3 zombies` caps at 3, `/break zombies` does not.
 *
 * @param {string} args  Everything typed after the command itself.
 */
function startFromCommand(args = '') {
  const trimmed = args.trim()
  const capped = trimmed.match(/^(\d+)(?:\s+([\s\S]+))?$/)

  const limit = capped ? Number(capped[1]) : null
  const text = (capped ? capped[2] : trimmed)?.trim()

  if (limit != null && limit < 1) {
    ui.notifications.warn('Break | The response limit must be at least 1.')
    return
  }

  breakResults?.start({ ...(text ? { text } : {}), limit })
}

/**
 * Set once Chat Commander has accepted the command, so the raw `chatMessage`
 * fallback below can stand down. Gated on the registration actually happening
 * rather than on the library merely being active: if registration ever fails,
 * the fallback stays live and `/break` keeps working.
 */
let usingChatCommands = false

/**
 * Suggestions shown while the GM types the command. Chat Commander only asks
 * for these when it is installed, so nothing here runs without it.
 */
function autocompleteBreak(menu, alias, parameters) {
  const commands = game.chatCommands
  const args = parameters.trim()

  // A leading integer is always read as the cap, which is the one part of the
  // syntax that surprises people. Say so while they are typing it.
  if (/^\d+$/.test(args)) {
    return [
      commands.createInfoElement(
        `<p class="notes">Keeps only the fastest ${args}. Anything after the number is the prompt text.</p>`,
      ),
    ]
  }

  if (args) return []

  return [
    commands.createCommandElement(`${alias} `, 'Prompt everyone, keep every response'),
    commands.createCommandElement(`${alias} 3 `, 'Prompt everyone, keep only the fastest 3'),
    commands.createInfoElement(
      '<p class="notes">A leading number is the cap, the rest is the prompt text. ' +
        'To open with a number, put a word first: <code>/break the 3 goblins charge</code>.</p>',
    ),
  ]
}

/**
 * Hand the command to Chat Commander when it is installed, which buys the
 * autocomplete menu and an entry in its command list. Registered at init
 * because the library fires this during its own `ready` hook.
 *
 * @see https://gitlab.com/woodentavern/foundryvtt-chat-command-lib
 */
Hooks.on('chatCommandsReady', (commands) => {
  try {
    commands.register({
      name: '/break',
      module: BREAK_MODULE_NAME,
      description: 'Prompt every player to buzz in, fastest first.',
      icon: '<i class="fa-solid fa-bell"></i>',
      // Checked with game.user.hasRole before the callback is ever reached, so
      // the library reports the permission failure for us.
      requiredRole: 'GAMEMASTER',
      callback: (chat, parameters) => {
        startFromCommand(parameters)
        // An empty object means "handled, post nothing".
        return {}
      },
      autocompleteCallback: autocompleteBreak,
    })
    usingChatCommands = true
  } catch (error) {
    // Keep the fallback live rather than losing the command outright.
    console.error('Break | Could not register /break with Chat Commander.', error)
  }
})

/**
 * `/break` starts a round, `/break <text>` sets the prompt shown to players.
 * Returning false stops the command being posted as a chat message.
 *
 * This is the path used when Chat Commander is not installed. Foundry stops
 * calling `chatMessage` handlers at the first one to return false, so leaving
 * both live would make the winner depend on module load order.
 */
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  if (usingChatCommands) return true

  const match = message.match(/^\/break(?:\s+([\s\S]+))?$/i)
  if (!match) return true

  if (!game.user.isGM) {
    ui.notifications.warn('Only a GM can start a buzzer round.')
    return false
  }

  startFromCommand(match[1] ?? '')
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
     * @param {string} [options.text]   Message shown to players.
     * @param {number} [options.limit]  Keep only the fastest this many responses.
     */
    prompt: (options) => breakResults?.start(options),
    /** End the current round and close every overlay. */
    dismiss: () => breakResults?.dismiss(),
  }
})
