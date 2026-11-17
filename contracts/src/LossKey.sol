// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LossKey
 * @notice Canonical economic-loss identity, distinct from claimId.
 *
 * lossKey = keccak256(abi.encode(
 *   chainId,
 *   policyId,
 *   exposureKey,
 *   incidentRef,
 *   lossLotId
 * ))
 *
 * claimId identifies a settlement attempt/record.
 * lossKey identifies the covered economic loss lot being compensated.
 * Partial payouts against one lossKey are allowed up to an immutable lossCap.
 */
library LossKey {
    function compute(
        uint256 chainId,
        bytes32 policyId,
        bytes32 exposureKey,
        bytes32 incidentRef,
        bytes32 lossLotId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(chainId, policyId, exposureKey, incidentRef, lossLotId));
    }
}
