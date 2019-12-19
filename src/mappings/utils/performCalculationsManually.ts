import { BigInt, Address } from "@graphprotocol/graph-ts";
import { FeeManagerContract } from "../../types/templates/PriceSourceDataSource/FeeManagerContract";
import { PerformanceFeeContract } from "../../types/templates/PriceSourceDataSource/PerformanceFeeContract";

import {
  AccountingContract__performCalculationsResult,
  AccountingContract
} from "../../types/templates/PriceSourceDataSource/AccountingContract";

export function performCalculationsManually(
  fundGavFromAssets: BigInt,
  totalSupply: BigInt,
  feeManagerAddress: Address,
  accountingContract: AccountingContract
): AccountingContract__performCalculationsResult {
  let feeManagerContract = FeeManagerContract.bind(feeManagerAddress);

  // (management fee amount can be calculated by the contract (not dependent on price))
  let mgmtFeeAmount = feeManagerContract.managementFeeAmount();

  // (performance fee is dependent on price, so we need to calculate manually)
  let perfFeeAddress = feeManagerContract.fees(BigInt.fromI32(1));
  let perfFeeContract = PerformanceFeeContract.bind(perfFeeAddress);

  let gavPerShare = accountingContract.DEFAULT_SHARE_PRICE();
  if (totalSupply.gt(BigInt.fromI32(0))) {
    gavPerShare = accountingContract.valuePerShare(
      fundGavFromAssets,
      totalSupply
    );
  }

  let highWaterMark = perfFeeContract.highWaterMark(
    feeManagerContract._address
  );

  let perfFeeAmount = BigInt.fromI32(0);
  if (
    gavPerShare.gt(highWaterMark) &&
    !totalSupply.isZero() &&
    !fundGavFromAssets.isZero()
  ) {
    let sharePriceGain = gavPerShare.minus(highWaterMark);
    let totalGain = sharePriceGain
      .times(totalSupply)
      .div(perfFeeContract.DIVISOR());
    let feeInAsset = totalGain.times(
      perfFeeContract
        .performanceFeeRate(feeManagerContract._address)
        .div(perfFeeContract.DIVISOR())
    );
    let preDilutionFee = totalSupply.times(feeInAsset).div(fundGavFromAssets);
    perfFeeAmount = preDilutionFee
      .times(totalSupply)
      .div(totalSupply.minus(preDilutionFee));
  }
  let feesInShares = mgmtFeeAmount.plus(perfFeeAmount);

  let feesInDenominationAsset = BigInt.fromI32(0);
  if (!totalSupply.isZero()) {
    feesInDenominationAsset = feesInShares
      .times(fundGavFromAssets)
      .div(totalSupply.plus(feesInShares));
  }

  let nav = fundGavFromAssets.minus(feesInDenominationAsset);

  let totalSupplyAccountingForFees = totalSupply.plus(feesInShares);

  let sharePrice = accountingContract.DEFAULT_SHARE_PRICE();
  let gavPerShareNetManagementFee = accountingContract.DEFAULT_SHARE_PRICE();
  if (!totalSupply.isZero()) {
    sharePrice = accountingContract.valuePerShare(
      fundGavFromAssets,
      totalSupplyAccountingForFees
    );
    gavPerShareNetManagementFee = accountingContract.valuePerShare(
      fundGavFromAssets,
      totalSupply.plus(mgmtFeeAmount)
    );
  }

  return new AccountingContract__performCalculationsResult(
    fundGavFromAssets,
    feesInDenominationAsset,
    feesInShares,
    nav,
    sharePrice,
    gavPerShareNetManagementFee
  );
}
