import axios, { type AxiosRequestConfig } from 'axios'
import type { TrackingExecutionResponseData } from 'services/crossChain/adapters/KyberCrossAdapter/types'
import type { Hash } from 'viem'

import { CROSSCHAIN_KYBERCROSS_API } from 'constants/env'

type ErrorBody = {
  code: string
  message: string
  details?: Record<string, unknown>
}

export type SuccessResponse<TData> = {
  request_id: string
  success: true
  data: TData
}

type ErrorResponse = {
  request_id: string
  success: false
  error: ErrorBody
}

export type ApiResponse<TData> = SuccessResponse<TData> | ErrorResponse

export type ScanTxStatusResponse = SuccessResponse<TrackingExecutionResponseData>

const kyberCrossApiClient = axios.create({
  baseURL: CROSSCHAIN_KYBERCROSS_API,
  headers: {
    'Content-Type': 'application/json',
  },
})

const call = async <TData>(config: AxiosRequestConfig): Promise<SuccessResponse<TData>> => {
  const { data, status } = await kyberCrossApiClient.request<ApiResponse<TData>>({
    validateStatus: () => true,
    ...config,
  })

  if (status < 200 || status >= 300 || !data.success) {
    throw new Error(data.success ? `KyberCross API failed with HTTP ${status}` : data.error.message)
  }

  return data
}

const scanTxStatus = (txHash: Hash): Promise<ScanTxStatusResponse> =>
  call<TrackingExecutionResponseData>({
    method: 'GET',
    url: '/api/v1/executions',
    params: { source_tx_hash: txHash },
    timeout: 15_000,
  })

export const kyberCrossApi = {
  scanTxStatus,
}
