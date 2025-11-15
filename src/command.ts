import { spawn } from "node:child_process"
import { cwd } from "node:process"

import { ResultAsync } from "neverthrow"
import { resolve as resolvePath } from "pathe"

export const SPAWN_MISSING_EXE_CODE = -2

export type SpawnInfo = {
    executable: string
    commandArgs: Array<string>
    cwd: string
}

export type FluentCommandSuccess = SpawnInfo & {
    duration: number
    output: string
    stderr: string
    stdout: string
}

export type FluentCommandError = FluentCommandSuccess & {
    code?: number
    signal?: NodeJS.Signals
}

export type OutputHandler = (output: string) => void

export type SpawnHandler = (spawnInfo: SpawnInfo) => void

export class FluentCommand {
    #executable: string
    #commandArgs: Array<string>
    #startTime = 0
    #stdoutContents = ""
    #stderrContents = ""
    #outputContents = ""
    #code: number | null = null
    #signal: NodeJS.Signals | null = null
    #cwdPath = ""
    #extraCwdPathPieces: Array<string> = []
    #resolvedCwd = ""
    #spawnHandler: SpawnHandler | undefined
    #stdoutHandler: OutputHandler | undefined
    #stderrHandler: OutputHandler | undefined
    #outputHandler: OutputHandler | undefined
    #shouldBeSilent = true

    constructor(executable: string, ...initialArgs: Array<string>) {
        this.#executable = executable
        this.#commandArgs = initialArgs
    }

    #addArgs = (...extraArgs: ReadonlyArray<string>) => {
        this.#commandArgs.push(...extraArgs)
    }

    #addOptionPair = (
        dashes: 1 | 2,
        optionKey: string,
        optionValue?: string | number,
    ) => {
        if (optionKey.length > 0) {
            const dashedOption = "-".repeat(dashes) + optionKey
            this.#addArgs(dashedOption)
        }

        if (typeof optionValue === "string" && optionValue.length > 0) {
            this.#addArgs(optionValue)
        } else if (typeof optionValue === "number") {
            this.#addArgs(optionValue.toString())
        }
    }

    #commandSuccess = () => {
        const results = {
            stdout: this.#stdoutContents.trimEnd(),
            stderr: this.#stderrContents.trimEnd(),
            output: this.#outputContents.trimEnd(),
            executable: this.#executable,
            commandArgs: this.#commandArgs,
            cwd: this.#resolvedCwd,
            duration: performance.now() - this.#startTime,
        } as const satisfies FluentCommandSuccess
        return results
    }

    #commandError = () => {
        const metaData: FluentCommandError = this.#commandSuccess()
        if (this.#code !== null) {
            metaData.code = this.#code
        }
        if (this.#signal !== null) {
            metaData.signal = this.#signal
        }
        return metaData
    }

    #onChunk = (source: "stdout" | "stderr", chunk: string) => {
        let handler = this.#stdoutHandler
        if (source === "stdout") {
            handler = this.#stdoutHandler
            this.#stdoutContents += chunk
        } else if (source === "stderr") {
            handler = this.#stderrHandler
            this.#stderrContents += chunk
        }
        this.#outputContents += chunk

        if (handler) {
            handler(chunk)
        }
        if (this.#outputHandler) {
            this.#outputHandler(chunk)
        }

        if (!this.#shouldBeSilent) {
            process[source].write(chunk)
        }
    }

    #onSpawn = () => {
        if (this.#spawnHandler) {
            this.#spawnHandler({
                executable: this.#executable,
                commandArgs: this.#commandArgs,
                cwd: this.#resolvedCwd,
            })
        }
    }

    #runOrRead = ResultAsync.fromThrowable(
        () =>
            new Promise<FluentCommandSuccess>((resolve, reject) => {
                this.#startTime = performance.now()
                this.#resolvedCwd = resolvePath(
                    resolvePath(cwd()),
                    this.#cwdPath,
                    ...this.#extraCwdPathPieces,
                )

                const proc = spawn(this.#executable, this.#commandArgs, {
                    cwd: this.#resolvedCwd,
                    windowsHide: true,
                })

                proc.stdout.setEncoding("utf8")
                proc.stdout.on("data", (stdoutChunk) => {
                    this.#onChunk("stdout", stdoutChunk)
                })

                proc.stderr.setEncoding("utf8")
                proc.stderr.on("data", (stderrChunk) => {
                    this.#onChunk("stderr", stderrChunk)
                })

                proc.on("spawn", this.#onSpawn)

                proc.on("error", reject)

                proc.on("close", (code, signal) => {
                    this.#code = code
                    this.#signal = signal
                    if (code === 0) {
                        resolve(this.#commandSuccess())
                    } else {
                        reject()
                    }
                })
            }),
        (err) => {
            if (
                err != null &&
                typeof err === "object" &&
                "code" in err &&
                typeof err.code === "string"
            ) {
                const error = err as NodeJS.ErrnoException
                this.#code = SPAWN_MISSING_EXE_CODE
                this.#onChunk("stderr", `${error.code}: ${error.message}`)
            }
            return this.#commandError()
        },
    )

    args = (anArg: string, ...extraArgs: Array<string>) => {
        this.#addArgs(anArg, ...extraArgs)
        return this
    }

    cwd = (cwdPath: string, ...extraCwdPathPieces: Array<string>) => {
        this.#cwdPath = cwdPath
        this.#extraCwdPathPieces = extraCwdPathPieces
        return this
    }

    opt = (optionKey: string, optionValue?: string | number) => {
        this.#addOptionPair(1, optionKey, optionValue)
        return this
    }

    option = (optionKey: string, optionValue?: string | number) => {
        this.#addOptionPair(2, optionKey, optionValue)
        return this
    }

    onSpawn = (spawnHandler: SpawnHandler) => {
        this.#spawnHandler = spawnHandler
        return this
    }

    onStdout = (stdoutHandler: OutputHandler) => {
        this.#stdoutHandler = stdoutHandler
        return this
    }

    onStderr = (stderrHandler: OutputHandler) => {
        this.#stderrHandler = stderrHandler
        return this
    }

    onOutput = (outputHandler: OutputHandler) => {
        this.#outputHandler = outputHandler
        return this
    }

    run = () => {
        this.#shouldBeSilent = false
        return this.#runOrRead()
    }

    read = () => {
        this.#shouldBeSilent = true
        return this.#runOrRead()
    }
}

export function fcmd(...args: ConstructorParameters<typeof FluentCommand>) {
    return new FluentCommand(...args)
}
