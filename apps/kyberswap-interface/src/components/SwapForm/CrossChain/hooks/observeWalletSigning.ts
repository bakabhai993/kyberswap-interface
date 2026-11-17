import type { WalletClient } from 'viem'

/** Observe wallet prompts without changing the signer or treating approval hashes as swap hashes. */
export const observeWalletSigning = <T extends object>(
  wallet: T,
  methods: readonly (keyof T)[],
  onSigning: (signing: boolean) => void,
): T => {
  const observed = { ...wallet }
  for (const method of methods) {
    const sign = wallet[method]
    if (typeof sign !== 'function') continue

    Object.assign(observed, {
      [method]: async (...args: unknown[]) => {
        onSigning(true)
        try {
          return await sign.apply(wallet, args)
        } finally {
          onSigning(false)
        }
      },
    })
  }
  return observed
}

export const observeEvmWalletSigning = (wallet: WalletClient, onSigning: (signing: boolean) => void): WalletClient => {
  const observed = observeWalletSigning(
    wallet,
    ['sendTransaction', 'writeContract', 'signMessage', 'signTypedData'],
    onSigning,
  )
  const transport = observeWalletSigning(wallet.transport, ['request'], onSigning)

  return {
    ...observed,
    // Relay creates its own viem client from this transport, bypassing wallet actions.
    // Read-only RPC requests must not show a wallet confirmation prompt.
    transport: {
      ...wallet.transport,
      request: (...args) => {
        const method = args[0].method
        return [
          'eth_sendTransaction',
          'eth_signTransaction',
          'eth_sign',
          'personal_sign',
          'eth_signTypedData',
          'eth_signTypedData_v4',
        ].includes(method)
          ? transport.request(...args)
          : wallet.transport.request(...args)
      },
    },
  }
}
