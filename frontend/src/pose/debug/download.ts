// Saving files from the debugger: recorded clips, frame logs, validation trials.

export function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

export function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}
