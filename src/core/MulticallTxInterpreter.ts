import { RawDecodedCallData } from "interfaces/decoded";
import { TraceLog } from "interfaces/rawData";
import ABIDecoder from "utils/abi-decoder";

const pruneTraceRecursive = (calls: TraceLog[]): TraceLog[] => {
  if (!calls.length) {
    throw new Error("This shouldn't happen")
  }
  if (!calls[0].subtraces) {
    return calls
  }
  const callsToRemove = calls[0].subtraces
  let newRestOfCalls = [...calls]
  for (let i = 0; i < callsToRemove; i++) {
    newRestOfCalls = [newRestOfCalls[0], ...pruneTraceRecursive(newRestOfCalls.slice(1))]
    newRestOfCalls.splice(1, 1)
  }

  return newRestOfCalls
}

export async function decodeRawTxTrace(abiDecoder: ABIDecoder, txTrace: TraceLog[]): Promise<RawDecodedCallData[]> {
  const secondLevelCallsCount = txTrace[0].subtraces
  const secondLevelCalls = []
  let callsToPrune = txTrace.slice(1)
  for (let i = 0; i < secondLevelCallsCount; i++) {
    callsToPrune = pruneTraceRecursive(callsToPrune)
    secondLevelCalls.push(callsToPrune[0])
    callsToPrune.shift()
  }
  if (callsToPrune.length) {
    throw new Error("This shouldn't happen")
  }

  return Promise.all(secondLevelCalls.map((call) => abiDecoder.decodeMethod((call.action as any)?.input || '')))
}