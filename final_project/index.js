const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-secret-key';
const BOOKS_FILE = path.join(__dirname, 'books.json');

app.use(bodyParser.json());

// Simple HTML view for browser access
app.get('/', async (req, res) => {
  try {
    const books = await getBooks();
    const isbnQuery = (req.query.isbn || '').toString().trim();
    const filteredBooks = isbnQuery
      ? books.filter(b => b.isbn.toString() === isbnQuery)
      : books;
    const items = filteredBooks
      .map(
        b =>
          `<li><strong>${b.title}</strong> by ${b.author} (ISBN: ${b.isbn}) - Reviews: ${b.reviews.length}</li>`
      )
      .join('');

    const heading = isbnQuery ? `Books for ISBN: ${isbnQuery}` : 'All Books';
    const emptyState = items
      ? ''
      : `<p>No books found for ISBN: ${isbnQuery}</p>`;

    res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Book List</title>
        </head>
        <body>
          <h1>${heading}</h1>
          ${emptyState}
          <ul>${items}</ul>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Failed to retrieve books');
  }
});

async function getBooks() {
  const data = await fs.readFile(BOOKS_FILE, 'utf8');
  return JSON.parse(data);
}

async function saveBooks(books) {
  await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
}

const users = [];

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Task 2: Get all books
app.get('/books', async (req, res) => {
  try {
    const books = await getBooks();
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve books' });
  }
});

// Task 3: Get book by ISBN
app.get('/isbn/:isbn', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.isbn === req.params.isbn);
    if (book) res.json(book);
    else res.status(404).json({ error: 'Book not found' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve book' });
  }
});

// Task 4: Get books by author
app.get('/author/:author', async (req, res) => {
  try {
    const books = await getBooks();
    const filtered = books.filter(b => b.author.toLowerCase() === req.params.author.toLowerCase());
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve books' });
  }
});

// Task 5: Get books by title
app.get('/title/:title', async (req, res) => {
  try {
    const books = await getBooks();
    const filtered = books.filter(b => b.title.toLowerCase().includes(req.params.title.toLowerCase()));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve books' });
  }
});

// Task 6: Get book review (returns ONLY reviews)
app.get('/review/:isbn', async (req, res) => {
  try {
    const books = await getBooks();
    const book = books.find(b => b.isbn === req.params.isbn);
    if (book) {
      res.json({ reviews: book.reviews });
    } else {
      res.status(404).json({ error: 'Book not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve reviews' });
  }
});

// Task 7: Register user
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const existingUser = users.find(u => u.username === username);
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, password: hashedPassword });
  res.status(201).json({ message: 'User registered successfully' });
});

// Task 8: Login (returns message + token)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ message: 'Login successful!', token: token });
});

// Task 9: Add/Modify review
app.put('/review/:isbn', authenticateToken, async (req, res) => {
  const { isbn } = req.params;
  const { review } = req.body;
  const username = req.user.username;

  try {
    const books = await getBooks();
    const book = books.find(b => b.isbn === isbn);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const existingReviewIndex = book.reviews.findIndex(r => r.username === username);
    if (existingReviewIndex !== -1) {
      book.reviews[existingReviewIndex].review = review;
    } else {
      book.reviews.push({ username, review });
    }

    await saveBooks(books);
    res.json({ message: 'Review added/updated successfully', reviews: book.reviews });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Task 10: Delete review
app.delete('/review/:isbn', authenticateToken, async (req, res) => {
  const { isbn } = req.params;
  const username = req.user.username;

  try {
    const books = await getBooks();
    const book = books.find(b => b.isbn === isbn);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const reviewIndex = book.reviews.findIndex(r => r.username === username);
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    book.reviews.splice(reviewIndex, 1);
    await saveBooks(books);
    res.json({ message: 'Review deleted successfully', reviews: book.reviews });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});