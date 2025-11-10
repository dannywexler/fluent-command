export function greet(name: string) {
    return `Hello ${name}`
}

if (import.meta.vitest) {
    const { it, expect } = import.meta.vitest

    it("Can test right in source code", () => {
        expect(greet("Name")).toEqual("Hello Name")
    })
}
