import { NextResponse } from 'next/server';
import { callBilling } from '@/lib/bff';

export const POST = async () => {
  const { status, json } = await callBilling('POST', '/v1/billing/cancel');
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
};
