type MutationToken = {
  holder: string
  id: number
}

let currentToken: MutationToken | null = null
let lockSequence = 0

export type WorldMutationLock = {
  holder: string
  release: () => void
}

export function tryAcquireWorldMutationLock(holder: string): WorldMutationLock | null {
  if (currentToken) {
    return null
  }

  const token: MutationToken = {
    holder,
    id: lockSequence + 1,
  }
  lockSequence = token.id
  currentToken = token

  let released = false

  return {
    holder,
    release: () => {
      if (released) {
        return
      }
      released = true
      if (currentToken?.id === token.id) {
        currentToken = null
      }
    },
  }
}

export function getActiveWorldMutationHolder() {
  return currentToken?.holder ?? null
}
