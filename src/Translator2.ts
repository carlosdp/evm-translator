import { AlchemyProvider, JsonRpcProvider } from '@ethersproject/providers'
import abiDecoder from 'abi-decoder'
import RawDataFetcher from 'core/RawDataFetcher'
import { DecodedDataAndLogs, DecodedLog, transformDecodedLogs } from 'core/transformDecodedLogs'
import { Address, Chain, ContractType, Decoded, Interpretation, RawTxData, RawTxDataWithoutTrace } from 'interfaces'
import { ABI_Item, ABI_ItemUnfiltered } from 'interfaces/abi'
import { getChainBySymbol, validateAndNormalizeAddress } from 'utils'
import Etherscan from 'utils/clients/Etherscan'

export type TranslatorConfigTwo = {
    chain: Chain
    nodeUrl?: string
    alchemyProjectId: string
    etherscanAPIKey: string
    userAddress?: string
}

export type NamesAndSymbolsMap = Record<Address, { name: string | null; symbol: string | null }>

// const defaultConfig: TranslatorConfigTwo = {
//     chain: getChainBySymbol('ETH'),
// }

class Translator2 {
    nodeUrl: string | null
    alchemyProjectId: string
    chain: Chain
    etherscanAPIKey: string
    provider: AlchemyProvider
    rawDataFetcher: RawDataFetcher
    etherscan: Etherscan
    userAddress: Address | null

    constructor(config: TranslatorConfigTwo) {
        this.chain = config.chain
        this.nodeUrl = config.nodeUrl || null
        this.alchemyProjectId = config.alchemyProjectId
        this.etherscanAPIKey = config.etherscanAPIKey
        this.userAddress = config.userAddress ? validateAndNormalizeAddress(config.userAddress) : null
        this.provider = this.getProvider()
        this.etherscan = new Etherscan(this.etherscanAPIKey)
        this.rawDataFetcher = new RawDataFetcher(this.provider)
    }

    private getProvider(): AlchemyProvider {
        if (this.nodeUrl) {
            throw new Error(
                'the node url option (JsonRpcProvider instead of AlchemyProvider) Not implemented. RawDataFetcher uses AlchemyProvider b/c defaultProvider was throwing errors, and using just Alchemy wasnt throwing errors',
            )
            // return new JsonRpcProvider(this.nodeUrl, this.chain.id)
        }
        if (this.alchemyProjectId) {
            return new AlchemyProvider(this.chain.id, this.alchemyProjectId)
        } else {
            throw new Error('No node url or alchemy project id provided')
        }
    }

    /**********************************************/
    /**** FROM WALLET ADDRESS OR TX HASH ONLY *****/
    /**********************************************/
    updateUserAddress(userAddress: string) {
        this.userAddress = validateAndNormalizeAddress(userAddress)
    }

    // Gets the txResponse, txReceipt, txTrace from a node. Archive node needed
    async getRawTxData(txHash: string): Promise<RawTxData> {
        return this.rawDataFetcher.getTxData(txHash)
    }

    async getRawTxDataWithoutTrace(txHash: string): Promise<RawTxDataWithoutTrace> {
        return this.rawDataFetcher.getTxDataWithoutTrace(txHash)
    }

    // Could rely on Etherscan, but they have a max of 10k records
    // async getAllTxHashesForAddress(address: string): Promise<string[]> {
    //     throw new Error('Not implemented')
    // }

    getContractAddressesFromRawTxData(rawTxData: RawTxData | RawTxDataWithoutTrace): Address[] {
        const { txReceipt } = rawTxData
        const addresses: Address[] = []
        addresses.push(validateAndNormalizeAddress(txReceipt.to))

        txReceipt.logs.forEach(({ address }) => {
            addresses.push(validateAndNormalizeAddress(address))
        })

        return [...new Set(addresses)]
    }

    /**********************************************/
    /**** USING TX AND CONTRACT ADDRESSES  ********/
    /****  Data used to decode & augment   ********/
    /**********************************************/
    async getABIsForContracts(contractAddresses: string[]): Promise<Record<Address, ABI_ItemUnfiltered[]>> {
        const addresses = contractAddresses.map((a) => validateAndNormalizeAddress(a))
        const abiMap = await this.etherscan.getABIs(addresses)

        return abiMap
    }

    async getNameAndSymbol(address: string): Promise<{ name: string; symbol: string }> {
        throw new Error('Not implemented')
    }

    async getNamesAndSymbols(contractAddresses: string[]): Promise<NamesAndSymbolsMap> {
        throw new Error('Not implemented')
    }

    async getEnsForAddresses(addresses: string[]): Promise<Record<Address, string>> {
        throw new Error('Not implemented')
    }

    async getOfficialNamesForContracts(contractAddresses: string[]): Promise<Record<Address, string>> {
        throw new Error('Not implemented')
    }

    // We should store this in a contracts table just so we can see this data more easily
    getContractType(address: string, abi: ABI_Item[]): Promise<ContractType> {
        throw new Error('Not implemented')
    }

    getContractTypes(contractToAbiMap: Record<Address, ABI_Item[]>): Promise<Record<Address, ContractType>> {
        throw new Error('Not implemented')
    }
    // ... might not even needs this, oops
    filterABIs(unfilteredABIs: Record<string, ABI_ItemUnfiltered[]>): Record<Address, ABI_Item[]> {
        const filteredABIs: Record<Address, ABI_Item[]> = {}

        for (const [addressStr, unfilteredABI] of Object.entries(unfilteredABIs)) {
            const address = validateAndNormalizeAddress(addressStr)
            const abi = unfilteredABI.filter(({ type }) => type === 'function' || type === 'event') as ABI_Item[]
            filteredABIs[address] = abi
        }

        return filteredABIs
    }

    /**********************************************/
    /******      DECODING / AUGMENTING     ********/
    /**********************************************/
    decodeTxData(rawTxData: RawTxData | RawTxDataWithoutTrace, ABIs: Record<Address, ABI_Item[]>): any {
        const allABIs = []
        for (const abis of Object.values(ABIs)) {
            allABIs.push(...abis)
        }
        abiDecoder.addABI(allABIs)

        const { txReceipt } = rawTxData
        const { logs } = txReceipt

        const decodedLogs = abiDecoder.decodeLogs(rawTxData.txReceipt.logs)
        const decodedData = abiDecoder.decodeMethod(rawTxData.txResponse.data)

        const augmentedDecodedLogs = decodedLogs.map((log, index) => {
            log.logIndex = logs[index].logIndex
            return log
        }) as DecodedLog[]

        const transformedDecodedLogs = transformDecodedLogs(rawTxData.txReceipt.logs, augmentedDecodedLogs)

        return { decodedLogs, decodedData, transformedDecodedLogs }
    }

    decodeTxDataArr(rawTxDataArr: RawTxData[], ABIs: Record<Address, ABI_Item[]>[]): Decoded[] {
        throw new Error('Not implemented')
    }

    augmentDecodedData(
        decodedData: Decoded,
        ens: Record<Address, string>,
        namesAndSymbolsMap: NamesAndSymbolsMap,
        officialContractNamesMap: Record<Address, string>,
        contractTypesMap: Record<Address, ContractType>,
    ): Decoded {
        throw new Error('Not implemented')
    }

    //This is a subset of augmentDecodedData
    // addEnsToDecodedData(decoded: Decoded, ens: Record<Address, string>): Decoded {
    //     throw new Error('Not implemented')
    // }

    /**********************************************/
    /******          INTERPRETING          ********/
    /**********************************************/

    interpretDecodedTx(decoded: Decoded, userAddress: Address | null = null): Interpretation {
        throw new Error('Not implemented')
    }

    // If we do this after we've created the example description, we'll have to figure out how to parse any addresses we've turned into a shorter name or onoma name
    // addEnsToInterpretedData(ens: Record<Address, string>): Interpretation {
    //     throw new Error('Not implemented')
    // }

    async interpretTx(txHash: string, userAddress: Address | null = null): Promise<Interpretation> {
        const rawTxData = await this.getRawTxData(txHash)
        const addresses = this.getContractAddressesFromRawTxData(rawTxData)
        const unfilteredAbiMap = await this.getABIsForContracts(addresses)
        const AbiMap = this.filterABIs(unfilteredAbiMap)
        const ENSs = await this.getEnsForAddresses(addresses)
        const nameAndSymbols = await this.getNamesAndSymbols(addresses)
        const officialContractNames = await this.getOfficialNamesForContracts(addresses)
        const contractTypesMap = await this.getContractTypes(AbiMap)

        const decoded = this.decodeTxData(rawTxData, AbiMap)
        const decodedWithAugmentation = this.augmentDecodedData(
            decoded,
            ENSs,
            nameAndSymbols,
            officialContractNames,
            contractTypesMap,
        )

        const interpretation = this.interpretDecodedTx(decodedWithAugmentation, userAddress)

        return interpretation
    }
}

export default Translator2
