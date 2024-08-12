import React, { useCallback, useState } from 'react';
import { Accept, useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import styles from './styles.module.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/**
 * Component for handling file uploads and processing JSON, Excel, and CSV files.
 * @returns {JSX.Element} The file upload component.
 */
export const FileUpload = () => {
    const [uploadedFiles, setUploadedFiles] = useState<(File | Transaction)[]>([]);
    const [transactionInfo, setTransactionInfo] = useState<Transaction[]>([]);
    const STATUS_OPTIONS = ['DECLINED', 'ERROR', 'APPROVED']
    const [selectedStatus, setSelectedStatus] = useState('DECLINED')
    /**
     * Function to handle the processing of files dropped into the dropzone.
     * @param {Array<File>} acceptedFiles - Array of accepted files.
     */
    interface Transaction {
        id: string;
        external_identifier: string;
        status: string;
        name: string;
        status_message: string;
    }

    const onDrop = useCallback((acceptedFiles: string[]) => {
        setUploadedFiles((prevFiles: Transaction[]) => [...prevFiles, ...acceptedFiles]);
        acceptedFiles.forEach((file: File) => {
            const reader = new FileReader();

            reader.onabort = () => {
                console.log('File reading was aborted');
                toast.error('File reading was aborted');
            };
            reader.onerror = () => {
                console.log('File reading has failed');
                toast.error('File reading has failed');
            };
            reader.onload = () => {
                const binaryStr = reader.result;

                if (file.type === 'application/json') {
                    try {
                        if (typeof binaryStr !== 'string') {
                            throw new Error('Invalid binary string');
                        }
                        const jsonData = JSON.parse(binaryStr);
                        console.log('JSON data:', jsonData);
                        toast.success('JSON file processed successfully');
                        processTransactions(jsonData);
                    } catch (error) {
                        console.error('Error parsing JSON:', error);
                        toast.error('Error parsing JSON');
                    }
                } else if (
                    file.type ===
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                ) {
                    try {
                        const workbook = XLSX.read(binaryStr, { type: 'binary' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const excelData = XLSX.utils.sheet_to_json(sheet);
                        console.log('Excel data:', excelData);
                        toast.success('Excel file processed successfully');
                        processTransactions(excelData);
                    } catch (error) {
                        console.error('Error reading Excel:', error);
                        toast.error('Error reading Excel');
                    }
                } else if (
                    file.type === 'text/csv' ||
                    file.name.endsWith('.csv')
                ) {
                    try {
                        const csvData = XLSX.read(binaryStr, { type: 'binary' });
                        const sheetName = csvData.SheetNames[0];
                        const sheet = csvData.Sheets[sheetName];
                        const csvJson = XLSX.utils.sheet_to_json(sheet);
                        console.log('CSV data:', csvJson);
                        toast.success('CSV file processed successfully');
                        processTransactions(csvJson);
                    } catch (error) {
                        console.error('Error reading CSV:', error);
                        toast.error('Error reading CSV');
                    }
                } else {
                    console.error('Unsupported file type:', file.type);
                    toast.error('Unsupported file type');
                }
            };

            if (
                file.type === 'application/json' ||
                file.type === 'text/csv' ||
                file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ) {
                reader.readAsBinaryString(file);
            }
        });
    }, []);

    /**
     * Process transaction data and update transaction info state.
     * @param {Array<Object>} transactions - Array of transaction objects.
     */
    const processTransactions = (transactions) => {
        const updatedTransactions = transactions.map((txn) => ({
            id: txn.id,
            external_identifier: txn.external_identifier,
            status: 'PENDING',
            status_message: 'DECLINED-Manual',
        }));
        setTransactionInfo((prevInfo) => [...prevInfo, ...updatedTransactions]);
    };

    const [onOver, setonOver] = useState(false)
    /**
     * Configuration for the react-dropzone component.
     */
    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        onDragOver: () => setonOver(true),
        onDragLeave: () => setonOver(false),
        accept: [
            'application/json',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
        ],
    });

    /**
  * Function to copy transaction information to clipboard and return list of transaction objects.
  * @returns {Array<Object>} List of transaction objects.
  */
    const copyTransactionText = () => {
        const txns = transactionInfo.map((txn) => ({
            id: `"${txn.id}"`,
            external_identifier: 'nil',
        }));

        const txnRepoCode = `
txns = [
${txns.map((txn) => (
            `  {
    id: ${txn.id},
    external_identifier: ${txn.external_identifier}
  }`
        )).join(',\n\n')}
];

txn_repo = TransactionRepository.new
txns.each do |txn|
  # Agregamos external identifier y cambiamos estado
  txn_id = txn[:id]
  txn_ei = txn[:external_identifier]
  new_status = Transaction::TransactionStatuses::${selectedStatus}
  new_status_message = 'DECLINED-Manual'
  TransactionRepository.new.update_monadic(txn_id,
                                           { status: Transaction::TransactionStatuses::PENDING,
                                             external_identifier: txn_ei })
  # agregamos el external identifier al payment_method
  t = txn_repo.find_by_id(txn_id).value!
  payment_method = t.payment_method
  extra = payment_method['extra'] || {}
  new_payment_method = payment_method.merge('extra' => extra.merge({ 'external_identifier' => t.external_identifier }))
  txn_repo.update_monadic(txn_id, payment_method: new_payment_method)
  # encolamos la Transaction
  FinalizeTransaction.enqueue(
    txn_id,
    new_status,
    new_status_message,
    Time.now
  )
end
`;

        const formattedText = txnRepoCode.replace(/^( {2})/gm, '  ');

        navigator.clipboard.writeText(formattedText);
        toast.info('Transaction information copied to clipboard');

        return txns;
    };


    return (
        <div>
            <label htmlFor="status-select">Select Status:</label>
            <select
                id="status-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
            >
                {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                        {status}
                    </option>
                ))}
            </select>
            <div
                style={{ border: onOver ? '2px dashed #000' : '2px dashed #ccc' }}
                {...getRootProps({ className: `${styles.dropzone} ${uploadedFiles.length > 0 ? styles.uploaded : ''}` })}
            >
                <input {...getInputProps()} />
                <p>Drag & drop a JSON, Excel, or CSV file here, or click to select one</p>
            </div>
            {uploadedFiles.length > 0 && (
                <ul className={styles['file-list']}>
                    {uploadedFiles.map((file, index) => (
                        <li key={index}>
                            {file?.name}
                        </li>
                    ))}
                </ul>
            )}
            {transactionInfo.length > 0 && (
                <div>
                    <h2>Transaction Information:</h2>
                    <button style={{
                        outline: 'none',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#ffffff',
                    }} onClick={copyTransactionText}>Copy Transaction Info</button>
                    <ul>
                        {transactionInfo.map((txn, index) => (
                            <li key={index}>
                                <strong>Transaction ID:</strong> {txn.id} <br />
                                <strong>External Identifier:</strong> {txn.external_identifier} <br />
                                <strong>Status:</strong> {txn.status} <br />
                                <strong>Status Message:</strong> {txn.status_message} <br />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <ToastContainer />
        </div>
    );
};

export default FileUpload;
