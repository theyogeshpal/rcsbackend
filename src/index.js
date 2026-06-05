import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import * as xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Set up Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Configure Multer for uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage });

// Store connected devices
// Map of socket.id -> { id, phoneModel, registeredAt }
const connectedDevices = new Map();

io.on('connection', (socket) => {
  console.log(`Device connected: ${socket.id}`);

  // When a device registers itself
  socket.on('register_device', (deviceInfo) => {
    connectedDevices.set(socket.id, {
      id: socket.id,
      phoneModel: deviceInfo.phoneModel || 'Unknown Device',
      registeredAt: new Date(),
      status: 'Online'
    });
    console.log(`Device registered: ${socket.id}`, deviceInfo);
    io.emit('device_list_updated', Array.from(connectedDevices.values()));
  });

  socket.on('disconnect', () => {
    console.log(`Device disconnected: ${socket.id}`);
    connectedDevices.delete(socket.id);
    io.emit('device_list_updated', Array.from(connectedDevices.values()));
  });
});

// Endpoint to get all registered devices (for Admin Panel)
app.get('/api/devices', (req, res) => {
  res.json(Array.from(connectedDevices.values()));
});

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// Endpoint to create a campaign
app.post('/api/campaigns', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'excel', maxCount: 1 }
]), (req, res) => {
  try {
    const { text } = req.body;
    const imageFile = req.files['image'] ? req.files['image'][0] : null;
    const excelFile = req.files['excel'] ? req.files['excel'][0] : null;

    if (!excelFile) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    if (connectedDevices.size === 0) {
      return res.status(400).json({ error: 'No devices connected. Cannot distribute campaign.' });
    }

    // Parse Excel file
    const workbook = xlsx.readFile(excelFile.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Extract numbers (assuming first column has the numbers)
    // Filter out empty rows and header if necessary
    const numbers = data.map(row => row[0]).filter(val => !!val).map(String);

    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No valid numbers found in the excel sheet.' });
    }

    // Distribute equally among connected devices
    const devices = Array.from(connectedDevices.values());
    const deviceCount = devices.length;
    const baseAmount = Math.floor(numbers.length / deviceCount);
    let remainder = numbers.length % deviceCount;

    let currentIndex = 0;
    const distributions = [];

    const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : null;

    devices.forEach(device => {
      let amountForThisDevice = baseAmount + (remainder > 0 ? 1 : 0);
      remainder--;

      const allottedNumbers = numbers.slice(currentIndex, currentIndex + amountForThisDevice);
      currentIndex += amountForThisDevice;

      distributions.push({
        deviceId: device.id,
        phoneModel: device.phoneModel,
        numberCount: allottedNumbers.length
      });

      // Emit to this specific device
      io.to(device.id).emit('start_campaign', {
        text,
        imageUrl,
        numbers: allottedNumbers
      });
    });

    res.json({
      success: true,
      message: 'Campaign distributed successfully',
      totalNumbers: numbers.length,
      devicesInvolved: deviceCount,
      distributions
    });

  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[API] Server listening on port ${PORT}`);
});
