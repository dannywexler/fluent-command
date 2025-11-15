# Fluent Command

A fluent way to create and run commands, while attaching arguments, options and stdout/stderr listeners

## Installation

```sh
$ npm i fluent-command
```

## Quick Start

```ts
import { fcmd } from "fluent-command";

// set up command with the executable and some initial args
const commandResult = await fcmd("someExecutable", "someArg")

    // adds a single "-" before "someShortOption"
    .opt("someShortOption")

    // adds a double "-" before "someOptionKey"
    .option("someOptionKey", "someOptionValue")

    // adds additional args after the options
    .args("anotherArg", "lastArg")

    // can override the cwd of the command
    .cwd("/some/path")

    // can add a listener to spawn event
    .onSpawn(spawnInfo => {
        // the first arg provided to fcmd
        console.log("Spawned:", spawnInfo.executable)
        // array of all options and args
        console.log("With args:", spawnInfo.commandArgs)
        // resolved cwd of where the command was spawned
        console.log("In cwd:", spawnInfo.cwd)
    })

    // can add a listener to stdout
    .onStdout(stdOutChunk => console.log("Got stdout chunk:", stdOutChunk))

    // ... or stderr
    .onStderr(stdErrChunk => console.log("Got stderr chunk:", stdErrChunk))

    // ... or output (stdout and stderr interleaved)
    .onOutput(outputChunk => console.log("Got output chunk:", outputChunk))

    // Note that each stdout, stderr or output chunk is a utf8 encoded string


    // spawns the command, collects stdout and stderr, and prints the output of the command as it runs (writes each stdout and stderr chunk to process.stdout and process.stderr)
    .run()

    // or can call .read() which does the same as .run(), (still collecting stdout and stderr) but does not print anything.
    .read()


```

This is equivalent to running:
```sh
cd /some/path
someExecutable someArg -someShortOption --someOptionKey someOptionValue anotherArg lastArg
```

The returned `commandResult` is a [ResultAsync](https://github.com/supermacro/neverthrow/?tab=readme-ov-file#asynchronous-api-resultasync).


If the command succeeded (exited with code === 0), then `commandResult` is a `FluentCommandSuccess`:

```ts
export type FluentCommandSuccess = {
    commandArgs: Array<string>
    cwd: string
    duration: number
    executable: string
    output: string
    stderr: string
    stdout: string
}
```

or a `FluentCommandError` if the command had an error (exited with code !== 0):

```ts
export type FluentCommandError = {
    code?: number
    commandArgs: Array<string>
    cwd: string
    duration: number
    executable: string
    output: string
    signal?: NodeJS.Signals
    stderr: string
    stdout: string
}
```

