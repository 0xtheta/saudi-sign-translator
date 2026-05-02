async function readJson(response) {
  const contentType = response.headers.get('content-type') || ''
  let payload

  if (contentType.includes('application/json')) {
    payload = await response.json()
  } else {
    const text = await response.text()
    payload = {
      error: text || 'Request failed',
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed')
  }

  return payload
}

export async function loadAdminState() {
  const response = await fetch('/api/admin/state')
  return readJson(response)
}

export async function createAnimation(formData) {
  const response = await fetch('/api/admin/animations', {
    method: 'POST',
    body: formData,
  })
  return readJson(response)
}

export async function createPhrase(payload) {
  const response = await fetch('/api/admin/phrases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

export async function removeAnimation(animationId) {
  const response = await fetch(`/api/admin/animations/${animationId}`, {
    method: 'DELETE',
  })
  return readJson(response)
}

export async function removePhrase(phraseId) {
  const response = await fetch(`/api/admin/phrases/${phraseId}`, {
    method: 'DELETE',
  })
  return readJson(response)
}
