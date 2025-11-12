import { spawn } from "node:child_process"
import { cwd } from "node:process"

import { ResultAsync } from "neverthrow"
import { resolve as resolvePath } from "pathe"

export type FluentCommandSuccess = {
    cmd: string
    cmdArgs: Array<string>
    cwd: string
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

export class FluentCommand {
    #executable: string
    #commandArgs: Array<string>
    #startTime = 0
    #stdoutContents = ""
    #stderrContents = ""
    #outputContents = ""
    #code: number | undefined = undefined
    #signal: NodeJS.Signals | undefined = undefined
    #cwdPath = ""
    #extraCwdPathPieces: Array<string> = []
    #resolvedCwd = ""
    #stdoutHandler: OutputHandler | undefined
    #stderrHandler: OutputHandler | undefined
    #outputHandler: OutputHandler | undefined

    constructor(executable: string, ...initialArgs: Array<string>) {
        this.#executable = executable
        this.#commandArgs = initialArgs
    }

    #addArgs = (...extraArgs: ReadonlyArray<string>) => {
        this.#commandArgs.push(...extraArgs)
    }

    args = (anArg: string, ...extraArgs: Array<string>) => {
        this.#addArgs(anArg, ...extraArgs)
        return this
    }

    #addOptionPair = (
        dashes: 1 | 2,
        optionKey: string,
        optionValue?: string | number,
    ) => {
        if (optionKey.length > 0) {
            const dashesPrefix = "-".repeat(dashes) + optionKey
            this.#addArgs(dashesPrefix)
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
            cmd: this.#executable,
            cmdArgs: this.#commandArgs,
            cwd: this.#resolvedCwd,
            duration: performance.now() - this.#startTime,
        } as const satisfies FluentCommandSuccess
        return results
    }

    #commandError = () => {
        const metaData: FluentCommandError = this.#commandSuccess()
        if (this.#code !== undefined) {
            metaData.code = this.#code
        }
        if (this.#signal !== undefined) {
            metaData.signal = this.#signal
        }
        return metaData
    }

    #runOrRead = ResultAsync.fromThrowable(
        (shouldBeSilent: boolean) =>
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
                    this.#stdoutContents += stdoutChunk
                    if (!shouldBeSilent) {
                        process.stdout.write(stdoutChunk)
                    }
                    if (this.#stdoutHandler) {
                        this.#stdoutHandler(stdoutChunk)
                    }
                    if (this.#outputHandler) {
                        this.#outputHandler(stdoutChunk)
                    }
                })

                proc.stderr.setEncoding("utf8")
                proc.stderr.on("data", (stderrChunk) => {
                    this.#stderrContents += stderrChunk
                    if (!shouldBeSilent) {
                        process.stderr.write(stderrChunk)
                    }
                    if (this.#stderrHandler) {
                        this.#stderrHandler(stderrChunk)
                    }
                    if (this.#outputHandler) {
                        this.#outputHandler(stderrChunk)
                    }
                })

                proc.on("error", reject)

                proc.on("close", (code, signal) => {
                    if (code !== null) {
                        this.#code = code
                    }
                    if (signal !== null) {
                        this.#signal = signal
                    }
                    if (code === 0) {
                        resolve(this.#commandSuccess())
                    } else {
                        reject()
                    }
                })
            }),
        (err) => {
            if (
                err !== null &&
                typeof err === "object" &&
                "code" in err &&
                typeof err.code === "string"
            ) {
                const error = err as NodeJS.ErrnoException
                this.#stderrContents += `${error.code}: ${error.message}`
            }
            return this.#commandError()
        },
    )

    opt = (optionKey: string, optionValue?: string | number) => {
        this.#addOptionPair(1, optionKey, optionValue)
        return this
    }

    option = (optionKey: string, optionValue?: string | number) => {
        this.#addOptionPair(2, optionKey, optionValue)
        return this
    }

    cwd = (cwdPath: string, ...extraCwdPathPieces: Array<string>) => {
        this.#cwdPath = cwdPath
        this.#extraCwdPathPieces = extraCwdPathPieces
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

    run = () => this.#runOrRead(false)

    read = () => this.#runOrRead(true)
}

export function fcmd(...args: ConstructorParameters<typeof FluentCommand>) {
    return new FluentCommand(...args)
}
