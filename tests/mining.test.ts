import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMiningGenesis } from '../packages/core/src/local/mining.js';

const address = `0x${'1'.repeat(40)}`;
const allocations = { [address]: { balance: '1000000000000000000' } };
function input() {
  return {
    config: { chainId: 9, amsterdamTime: 1192, bogotaTime: 1384 },
    alloc: {
      ...structuredClone(allocations),
      '0x0000000000000000000000000000000000000001': { balance: '1' },
      '0x0000bff46984e3725691fa540a8c7589300d8282': {
        balance: '0',
        code: '0x00',
        storage: { [`0x${'0'.repeat(64)}`]: `0x${'f'.repeat(64)}` },
      },
    } as Record<
      string,
      { balance: string; code?: string; storage?: Record<string, string> }
    >,
  };
}

test('fixture validation preserves large fresh balances and reserved one-wei allocations', () => {
  assert.equal(
    validateMiningGenesis(input(), 1000, allocations).alloc[address]?.balance,
    allocations[address]!.balance,
  );
});
test('fixture validation rejects unexpected funded EOAs, including empty-code accounts', () => {
  for (const code of [undefined, '0x']) {
    const genesis = input();
    genesis.alloc[`0x${'2'.repeat(40)}`] =
      code === undefined ? { balance: '1' } : { balance: '1', code };
    assert.throws(
      () => validateMiningGenesis(genesis, 1000, allocations),
      /funded genesis/,
    );
  }
});
test('fixture validation rejects altered fresh balances and oversized reserved allocations', () => {
  const genesis = input();
  genesis.alloc[address]!.balance = '999999999999999999';
  assert.throws(
    () => validateMiningGenesis(genesis, 1000, allocations),
    /fixture balance/,
  );
  genesis.alloc[address]!.balance = allocations[address]!.balance;
  genesis.alloc['0x0000000000000000000000000000000000000001']!.balance = '2';
  assert.throws(
    () => validateMiningGenesis(genesis, 1000, allocations),
    /funded genesis/,
  );
});
test('fixture validation rejects wrong chains, fork schedules and missing deposit inhibitor', () => {
  const genesis = input();
  genesis.config.chainId = 1337;
  assert.throws(
    () => validateMiningGenesis(genesis, 1000, allocations),
    /fork schedule/,
  );
  genesis.config.chainId = 9;
  assert.throws(
    () => validateMiningGenesis(genesis, 1001, allocations),
    /fork schedule/,
  );
  delete genesis.alloc['0x0000bff46984e3725691fa540a8c7589300d8282']!.storage;
  assert.throws(
    () => validateMiningGenesis(genesis, 1000, allocations),
    /predeploy/,
  );
});
