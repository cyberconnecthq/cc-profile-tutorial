"use client";
import React from "react";
import Head from "next/head";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePrepareContractWrite,
  useContractWrite,
  useSignMessage,
} from "wagmi";
import { InjectedConnector } from "wagmi/connectors/injected";
import ProfileNFT from "@/abi/ProfileNFT.json";

export default function Home() {
  const {
    data: signMessageData,
    error: signMessageError,
    isLoading: signMessageIsLoading,
    signMessage,
  } = useSignMessage({
    onSuccess: (data) => verifyLoginMessage(data),
  });

  const [isMounted, setIsMounted] = React.useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [gasModeHandle, setGasModeHandle] = React.useState<string>();
  const [gaslessModeHandle, setGaslessModeHandle] = React.useState<string>();
  const { config, refetch } = usePrepareContractWrite({
    address: "0x57e12b7a5f38a7f9c23ebd0400e6e53f2a45f271",
    abi: ProfileNFT,
    functionName: "createProfile",
    args: [
      {
        to: address,
        handle: gasModeHandle,
        metadata: "",
        avatar: "",
        operator: "0x85AAc6211aC91E92594C01F8c9557026797493AE",
      },
      "0x",
      "0x",
    ],
    enabled: false,
  });

  const { write, data, isLoading, isSuccess } = useContractWrite(config);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  React.useEffect(() => {
    console.log(data, isLoading, isSuccess);
  }, [data, isLoading, isSuccess]);

  const { connect } = useConnect({
    connector: new InjectedConnector(),
  });

  React.useEffect(() => {
    if (localStorage.getItem("accessToken")) {
      setIsLoggedIn(true);
    }
  }, []);

  React.useEffect(() => {
    const rf = async () => {
      await refetch();
    };

    if (gasModeHandle) {
      rf();
    }
  }, [gasModeHandle]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const mint = async () => {
    await refetch();
    if (gasModeHandle) {
      write?.();
    }
  };

  const handleLogin = async () => {
    if (isLoggedIn) {
      localStorage.clear();
      location.reload();
    }
    if (!address) {
      return;
    }
    const res = await fetch("https://api.stg.cyberconnect.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
	mutation loginGetMessage($domain:String!,$address:AddressEVM! ) {
	  loginGetMessage(input:{
	    domain: $domain ,
	    address: $address
	  }) {
	    message
	  }
	}
      `,
        variables: {
          domain: "cyberconnect.me",
          address,
        },
      }),
    });

    const resp = await res.json();

    if (resp.data.loginGetMessage.message) {
      signMessage({
        message: resp.data.loginGetMessage.message,
      });
    }
  };

  const verifyLoginMessage = async (signature: string) => {
    const res = await fetch("https://api.stg.cyberconnect.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
	  mutation loginVerify($domain:String!, $address:AddressEVM!, $signature:String!) 
		{
		  loginVerify(input:{
		    domain:$domain,
		    address:$address,
		    signature:$signature
		  }){
		    accessToken
		  }
		}
      `,
        variables: {
          domain: "cyberconnect.me",
          address,
          signature,
        },
      }),
    });

    const resData = await res.json();
    if (resData.data.loginVerify.accessToken) {
      localStorage.setItem("accessToken", resData.data.loginVerify.accessToken);
      setIsLoggedIn(true);
    }
  };

  const createTypedData = async () => {
    const res = await fetch("https://api.stg.cyberconnect.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
      body: JSON.stringify({
        query: `
	  mutation createTypedData($to:AddressEVM!, $handle:String!, $avatar:URL!, $metadata:String!, $operator:AddressEVM!) {
		  createCreateProfileTypedData(input:{
		    to:$to
		    handle:$handle,
		  avatar: $avatar,
		  metadata: $metadata,
		  operator: $operator
		  }){
		  typedDataID
		  }
	}
      `,
        variables: {
          to: address,
          handle: gaslessModeHandle,
          avatar: "",
          metadata: "",
          operator: "0x85AAc6211aC91E92594C01F8c9557026797493AE",
        },
      }),
    });

    const resData = await res.json();

    console.log(resData);
    return resData.data.createCreateProfileTypedData.typedDataID;
  };

  const relay = async (typedDataID: string) => {
    const res = await fetch("https://api.stg.cyberconnect.dev/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        "X-API-KEY": "3Oc2eWR771lttA7KoHYGEstNboFZqKVi",
      },
      body: JSON.stringify({
        query: `
	  mutation relay($typedDataID:ID!, $signature:String) {
		  relay(input:{
		  typedDataID:$typedDataID,
		  signature:$signature
		  }){
		  relayActionId
		  }
	}
      `,
        variables: {
          typedDataID,
        },
      }),
    });

    const resData = await res.json();

    console.log(resData);
  };

  const gaslessMint = async () => {
    const id = await createTypedData();
    relay(id);
  };
  return (
    <>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <div className="flex flex-col items-center mt-24">
          <h1 className="text-5xl font-bold">ccProfile Tutorial</h1>
          <p className="mt-4">
            This tutorial shows how to mint a ccProfile in gasless and gas mode.
          </p>

          {isMounted && isConnected ? (
            <div className="flex gap-x-8">
              <p>Connected to {address}</p>
              <a className="text-blue-500" onClick={() => disconnect()}>
                Disconnect
              </a>
            </div>
          ) : (
            <button onClick={() => connect()}>Connect</button>
          )}
        </div>
        <div className="border w-1/3 mx-auto p-8 mt-8">
          <p className="text-3xl font-bold">Gas Mode</p>
          <div className="flex gap-x-4 mt-4">
            <div className="flex items-center gap-x-4">
              <p>Handle</p>
              {isLoading ? (
                <p> Confirming... </p>
              ) : data?.hash ? (
                <a
                  href={`https://testnet.bscscan.com/tx/${data.hash}`}
                  target="_black"
                  className="text-blue-500"
                >
                  Check on BscScan
                </a>
              ) : (
                <input
                  className="h-[30px] p-4 rounded"
                  value={gasModeHandle || ""}
                  onChange={(e) => setGasModeHandle(e.target.value)}
                />
              )}
            </div>
            <button
              className="bg-green-500 px-4 rounded"
              onClick={() => mint()}
            >
              Mint
            </button>
          </div>
        </div>
        <div className="border w-1/3 mx-auto p-8 mt-8">
          <p className="text-3xl font-bold">Gasless Mode</p>
          <button
            className="bg-green-500 px-4 rounded mt-4"
            onClick={handleLogin}
          >
            {isLoggedIn ? "Log out" : "Log in"}
          </button>
          <div className="flex gap-x-4 mt-4">
            <div className="flex items-center gap-x-4">
              <p>Handle</p>
              <input
                className="h-[30px] p-4 rounded"
                value={gaslessModeHandle || ""}
                onChange={(e) => setGaslessModeHandle(e.target.value)}
              />
            </div>
            <button
              className="bg-green-500 px-4 rounded"
              onClick={() => gaslessMint()}
            >
              Mint
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
