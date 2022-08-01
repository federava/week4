import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import Head from "next/head"
import React from "react"
import styles from "../styles/Home.module.css"
import { useFormik } from 'formik'
import * as yup from 'yup'
import TextField from '@material-ui/core/TextField'
import Button from '@material-ui/core/Button'
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"
import { Contract, providers, utils } from "ethers"



export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const [eventMsg, setEventMsg] = React.useState("...")

    const validationSchema = yup.object({
        name: yup.string().required('Name is a required field'),
        age: yup.number().required('Age is a required field'),
        address: yup.string().matches(/^0x[a-fA-F0-9]{40}$/ , 'Should have an Ethereum address format').required('Address is a required field')
    })
    
    const formik = useFormik({
        initialValues: {
            name: '',
            age: '',
            address: ''
        },
        onSubmit: (values) => {
            console.log(JSON.stringify(values))
        },
        validationSchema: validationSchema,
    })

    async function greet() {
        setLogs("Creating your Semaphore identity...")

        listenToGreeter();

        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }

        
    }

    async function listenToGreeter() {
        try {
            const provider = new providers.JsonRpcProvider("http://localhost:8545")
            const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider)
    
            contract.on('NewGreeting', (greeting: string) => {
                //console.log(utils.parseBytes32String(greeting))
                setEventMsg(utils.parseBytes32String(greeting))
            })
        } catch (e) {
            console.error(e);
        }
        
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>

                <div onClick={() => greet()} className={styles.button}>
                    Greet
                </div>

                <div>
                    <form onSubmit={formik.handleSubmit} className={styles.form}>
                        <TextField
                            id='name'
                            name='name'
                            label='Name'
                            margin='normal'
                            value={formik.values.name}
                            onChange={formik.handleChange}
                            error={formik.touched.name && Boolean(formik.errors.name)}
                            helperText={formik.touched.name && formik.errors.name}
                        />
                        <TextField
                            id='age'
                            name='age'
                            label='Age'
                            margin='normal'
                            value={formik.values.age}
                            onChange={formik.handleChange}
                            error={formik.touched.age && Boolean(formik.errors.age)}
                            helperText={formik.touched.age && formik.errors.age}
                        />
                        <TextField
                            id='address'
                            name='address'
                            label='Address'
                            margin='normal'
                            value={formik.values.address}
                            onChange={formik.handleChange}
                            error={formik.touched.address && Boolean(formik.errors.address)}
                            helperText={formik.touched.address && formik.errors.address}
                        />
                        <Button type='submit' variant='outlined'>Submit form</Button>
                    </form>
                </div>

                <div className={styles.description}>
                    Greeter contract message: {eventMsg}
                </div>
            </main>
        </div>
    )
}
