import { ProcessDefinition } from "@o-platform/o-process/dist/interfaces/processManifest";
import { ProcessContext } from "@o-platform/o-process/dist/interfaces/processContext";
import { fatalError } from "@o-platform/o-process/dist/states/fatalError";
import { createMachine } from "xstate";
import { EditorViewContext } from "@o-platform/o-editors/src/shared/editorViewContext";
import {prompt} from "@o-platform/o-process/dist/states/prompt";
import HtmlViewer from "../../../../../../packages/o-editors/src/HtmlViewer.svelte";
import {PromptConnectOrCreateContext} from "../connectOrCreate/promptConnectOrCreate";
import {RpcGateway} from "@o-platform/o-circles/dist/rpcGateway";
import {BN} from "ethereumjs-util";

export type FundSafeFromEoaContextData = {
  eoaAddress:string;
  safeAddress:string;
  successAction?: (data:FundSafeFromEoaContextData) => void;
  errorAction?: (data:FundSafeFromEoaContextData) => void;
};

export type FundSafeFromEoaContext = ProcessContext<FundSafeFromEoaContextData>;

const editorContent: { [x: string]: EditorViewContext } = {
  info: {
    title: "Fund safe",
    description:
      "We now fund your new safe",
    placeholder: "",
    submitButtonText: "",
  },
};

const processDefinition = (processId: string, skipIfNotDirty?: boolean) =>
  createMachine<FundSafeFromEoaContext, any>({
    id: `${processId}:fundSafeFromEoa`,
    initial: "info",
    states: {
      // Include a default 'error' state that propagates the error by re-throwing it in an action.
      // TODO: Check if this works as intended
      ...fatalError<PromptConnectOrCreateContext, any>("error"),

      info: prompt({
        id: "info",
        field: "__",
        component: HtmlViewer,
        params: {
          view: editorContent.info,
          html: () => "",
          hideNav: false,
        },
        navigation: {
          next: "#execute",
        }
      }),
      execute: {
        id: "execute",
        invoke: {
          src: async (context) => {
            const privateKey = sessionStorage.getItem("circlesKey");
            if (!privateKey)
              throw new Error(`The private key is not unlocked`);

            if (!context.data.eoaAddress || context.data.eoaAddress == ""
              || !context.data.safeAddress || context.data.safeAddress == "") {
              throw new Error(`The context's 'eoaAddress' or 'safeAddress' property is not set.`);
            }

            const web3 = RpcGateway.get();
            const minAccBalance = new BN(web3.utils.toWei("0.03", "ether"));
            const eoaBalance = new BN(await web3.eth.getBalance(context.data.eoaAddress));
            const gas = 41000;
            const gasPrice = new BN(await web3.eth.getGasPrice());
            const totalFee = gasPrice.mul(new BN(gas.toString()));
            const nonce = await web3.eth.getTransactionCount(context.data.eoaAddress);

            const availableForTransfer = eoaBalance
              .sub(totalFee)
              .sub(minAccBalance)

            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const signedTx = await account.signTransaction({
              from: context.data.eoaAddress,
              to: context.data.safeAddress,
              value: availableForTransfer,
              gasPrice: gasPrice,
              gas: gas,
              nonce: nonce
            });

            if (!signedTx?.rawTransaction) {
              throw new Error(`Couldn't send the invitation transaction`);
            }

            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log(receipt);
          },
          onDone: "#success"
        }
      },
      success: {
        type: "final",
        id: "success",
        entry: (context) => {
          if (context.data.successAction) {
            context.data.successAction(context.data);
          }
        }
      },
    },
  });

export const fundSafeFromEoa: ProcessDefinition<
  void,
  FundSafeFromEoaContextData
  > = {
  name: "fundSafeFromEoa",
  stateMachine: <any>processDefinition,
};