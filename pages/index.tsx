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
  useSignTypedData,
} from "wagmi";
import { InjectedConnector } from "wagmi/connectors/injected";
import ProfileNFT from "@/abi/ProfileNFT.json";
import { useForm, SubmitHandler } from "react-hook-form";
import axios from "axios";

const apiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY || "";
const apiSecret = process.env.NEXT_PUBLIC_PINATA_API_SECRET || "";

export const pinJSONToIPFS = async (json: { [key: string]: any }) => {
  const data = JSON.stringify(json);
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

  return axios
    .post(url, data, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: apiKey,
        pinata_secret_api_key: apiSecret,
      },
    })
    .then((response) => response.data.IpfsHash)
    .catch((error) => {
      throw error;
    });
};

type Profile = {
  handle: string;
  id: string;
  profileID: number;
  avatar: string;
  isPrimary: boolean;
  metadata: string;
  metadataInfo: ProfileMetadata;
};

type ProfileMetadata = {
  displayName: string;
  bio: string;
  avatar: string;
  attributes: Record<string, string>;
};

const DEFAULT_METADATA: Partial<ProfileMetadata> = {
  displayName: "",
  bio: "",
  avatar: "",
};

export default function Home() {
  const [metadataTypedDataID, setMetadataTypedDataID] = React.useState("");
  const [isMounted, setIsMounted] = React.useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [gasModeHandle, setGasModeHandle] = React.useState<string>();
  const [gaslessModeHandle, setGaslessModeHandle] = React.useState<string>();
  const [primaryProfile, setPrimaryProfile] = React.useState<Profile>();
  const [profileMetadata, setProfileMetadata] =
    React.useState<ProfileMetadata>();
  const { data: signMetadataSignature, signTypedData: signMetadata } =
    useSignTypedData();

  const { signMessage } = useSignMessage({
    onSuccess: (data) => verifyLoginMessage(data),
  });

  const onSubmit: SubmitHandler<Partial<ProfileMetadata>> = async (data) => {
    // Pin metadata to IPFS
    const hash = await pinJSONToIPFS(data);
    console.log("IPFS hash", { hash });

    // Get typed data
    const typedData = await createSetMetadataTypedData(hash);

    console.log("typedData", { typedData });

    // Sign typed data
    const parsed = JSON.parse(typedData.data);
    signMetadata({
      domain: parsed.domain,
      types: parsed.types,
      value: parsed.message,
    });
  };

  React.useEffect(() => {
    (async function () {
      if (signMetadataSignature && metadataTypedDataID) {
        // Relay action
        const relayActionId = await relay(
          metadataTypedDataID,
          signMetadataSignature
        );

        console.log("Relay action ID:", { relayActionId });

        // Long polling relay result
        if (relayActionId) {
          subscribe(relayActionId);
        }
      }
    })();
  }, [metadataTypedDataID, signMetadataSignature]);

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
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<Partial<ProfileMetadata>>();

  React.useEffect(() => {
    (async function () {
      console.log({ primaryProfile, profileMetadata });
      if (primaryProfile && !profileMetadata) {
        const res = await fetch(
          "https://cyberconnect.mypinata.cloud/ipfs/" + primaryProfile.metadata
        )
          .then((res) => res.json())
          .catch((e) => console.log(e));

        setProfileMetadata(res);
        console.log("profile metadata", res);
        if (!res) {
          return;
        }
        Object.keys(res).forEach((key: any) => setValue(key, res[key]));
      }
    })();
  }, [primaryProfile, profileMetadata]);

  React.useEffect(() => {
    if (isConnected && isLoggedIn) {
      getPrimaryProfile();
    }
  }, [isConnected, isLoggedIn]);

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
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
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
      }
    );

    const resp = await res.json();

    if (resp.data.loginGetMessage.message) {
      signMessage({
        message: resp.data.loginGetMessage.message,
      });
    }
  };

  const verifyLoginMessage = async (signature: string) => {
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
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
      }
    );

    const resData = await res.json();
    if (resData.data.loginVerify.accessToken) {
      localStorage.setItem("accessToken", resData.data.loginVerify.accessToken);
      setIsLoggedIn(true);
    }
  };

  const createSetMetadataTypedData = async (cid: string) => {
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          query: `
				  mutation createSetMetadataTypedData($input: CreateSetMetadataTypedDataInput!) {
					  createSetMetadataTypedData(input:$input){
					  typedData {
					  id
					  data
					  sender
					  }
					  }
				}
			      `,
          variables: {
            input: {
              metadata: cid,
              profileId: primaryProfile?.profileID,
            },
          },
        }),
      }
    );

    const resData = await res.json();

    const typedData = resData.data.createSetMetadataTypedData.typedData;
    const typeDataID = typedData.id;

    console.log("ID", typeDataID);
    setMetadataTypedDataID(typeDataID);

    return typedData;
  };

  const createTypedData = async () => {
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
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
      }
    );

    const resData = await res.json();

    console.log(resData);
    return resData.data.createCreateProfileTypedData.typedDataID;
  };

  const getPrimaryProfile = async () => {
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          query: `
	  query address($address: AddressEVM!) {
		address(address: $address) {
		  address
		  chainID
		  wallet {
			id
			address
			chainID
			primaryProfile {
				id
				profileID
				namespace {
				id
				name
				chainID
				}
				handle
				metadata
				metadataInfo {
				handle
				displayName
				bio
				avatar
				coverImage
				}
				avatar
				isPrimary
			}
		  }
		}
	}
      `,
          variables: {
            address: address,
          },
        }),
      }
    );

    const resData = await res.json();

    const primaryProfile = resData.data.address.wallet.primaryProfile;

    console.log(primaryProfile);

    setPrimaryProfile(primaryProfile);
  };

  const relay = async (typedDataID: string, signature?: string) => {
    console.log("relay", typedDataID);
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          "X-API-KEY": process.env.CYBERCONNECT_API_KEY,
        } as any,
        body: JSON.stringify({
          query: `
				mutation relay($input: RelayInput!) {
					relay(input:$input) {
						relayActionId
					}
				}
				`,
          variables: {
            input: {
              typedDataID,
              signature,
            },
          },
        }),
      }
    );

    const resData = await res.json();

    console.log("relay result", resData);
    return resData?.data?.relay?.relayActionId;
  };

  const relayActionStatus = async (relayActionId: string) => {
    const res = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT as string,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          "X-API-KEY": "3Oc2eWR771lttA7KoHYGEstNboFZqKVi",
        },
        body: JSON.stringify({
          query: `query relayActionStatus($relayActionId: ID!) {
				relayActionStatus(relayActionId: $relayActionId){ 
				... on RelayActionStatusResult {
				txHash
				}
				... on RelayActionError {
				reason
				}
				... on RelayActionQueued {
				reason
				}
				}
				}
			      `,
          variables: {
            relayActionId,
          },
        }),
      }
    );

    const resData = await res.json();

    return resData.data.relayActionStatus;
  };

  const subscribe = async (id: string) => {
    console.log("start polling");
    const res = await relayActionStatus(id);

    if (res.txHash) {
      alert("Metadata updated!");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("peroidic polling end");
    await subscribe(id);
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
            <div className="flex w-1/3 gap-x-8 border mt-4 p-4 items-center flex-col">
              <p>Connected to {address}</p>
              <a className="text-blue-500" onClick={() => disconnect()}>
                Disconnect
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-y-4">
              <button
                onClick={() => connect()}
                className="bg-green-500 p-2 rounded mt-4"
              >
                Connect Wallet
              </button>
              <p>Make sure your wallet network is on BSC testnet.</p>
            </div>
          )}
        </div>
        {primaryProfile ? (
          <div className="w-1/3 mx-auto">
            <p className="mt-4 text-xl">Profile</p>
            <p>Handle: {primaryProfile.handle}</p>
            <p>Profile ID: {primaryProfile.profileID}</p>
            <p className="mt-4 text-xl font-bold">Profile Metadata</p>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col w-full"
            >
              {Object.keys(DEFAULT_METADATA).map((key: any) => (
                <>
                  <label className="mt-4">{key} </label>
                  <input
                    defaultValue={(DEFAULT_METADATA as any)?.[key]}
                    className="h-[38px] border bg-black px-4 mt-2"
                    {...register(key)}
                  />
                </>
              ))}

              <input
                type="submit"
                className="mt-4 border border-green-300 w-[100px] text-green-300 self-center rounded"
                value="Update"
              />
            </form>
          </div>
        ) : (
          <>
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
                      disabled={!isConnected}
                      className="h-[30px] p-4 rounded"
                      value={gasModeHandle || ""}
                      onChange={(e) => setGasModeHandle(e.target.value)}
                    />
                  )}
                </div>
                <button
                  className="bg-green-500 px-4 rounded"
                  onClick={() => mint()}
                  disabled={!isConnected}
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
                disabled={!isConnected}
              >
                {isLoggedIn ? "Log out" : "Log in"}
              </button>
              <div className="flex gap-x-4 mt-4">
                <div className="flex items-center gap-x-4">
                  <p>Handle</p>
                  <input
                    disabled={!isConnected}
                    className="h-[30px] p-4 rounded"
                    value={gaslessModeHandle || ""}
                    onChange={(e) => setGaslessModeHandle(e.target.value)}
                  />
                </div>
                <button
                  className="bg-green-500 px-4 rounded"
                  onClick={() => gaslessMint()}
                  disabled={!isConnected}
                >
                  Mint
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
