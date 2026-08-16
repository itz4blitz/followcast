export function createUnixLineReader(
  connect: (path: string) => { readonly readable: AsyncIterable<string> },
): (path: string) => AsyncIterable<string> {
  return (path) => connect(path).readable
}
