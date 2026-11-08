// The browser half is plain JavaScript in the client-module format; tsc only
// builds the host half. Copy it next to the compiled entry so the package's
// ./client export and dsh.client declaration resolve after a build.
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })
copyFileSync('src/client.js', 'lib/client.js')
