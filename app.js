const express = require("express");
require("dotenv").config();
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const {listingSchema, reviewSchema} = require("./schema.js");

//default route
app.get("/", (req, res) => {
    res.send("Server Working....");
});

app.get("/listings/home", (req, res) => {
    res.render("listings/home.ejs");
});

//setting up connection
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/findnest";

main()
    .then(() => {
        console.log("connected to db");
    })
    .catch((err) => {
        console.log(err);
        console.log("Database error..");
    });

async function main() {
    await mongoose.connect(MONGO_URL);
};

// app.get("/testListing", async (req, res) => {
//     let sampleListing = new Listing ({
//         title: "My New Villa",
//         description: "By the beach",
//         price: 120000,
//         location: "Goa",
//         country: "India",
//     });

//     await sampleListing.save();
//     console.log("sample is saved");
//     res.send("successful testing"); 
// });


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

//index route
app.get("/listings", wrapAsync(async (req, res) => {
    const allListings = await Listing.find({});
    res.render("./listings/index.ejs", { allListings });
}));


//new route 
app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});


//show route
app.get("/listings/:id", wrapAsync(async (req, res) => {
    try {
        const { id } = req.params;
        const listing = await Listing.findById(id).populate("reviews");
        if (!listing) {
            return res.status(404).send("Listing not found");
        }
        res.render("listings/show.ejs", { listing });
    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid Listing ID");
    }
}));


//create route
app.post("/listings", wrapAsync(async (req, res, next) => {
    // 1. Ensure a default image exists before validation
    if (!req.body.listing.image) {
        req.body.listing.image = {
            filename: "default-image",
            url: "https://images.unsplash.com/photo-1725940896118-739f53527af9?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoYXJtaW5nJTIwY290dGFnZXxlbnwwfHwwfHx8MA%3D%3D"
        };
    }

    // 2. Validate using Joi schema (ignore extra fields like image)
    let result = listingSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
    if (result.error) {
        throw new ExpressError(400, result.error.details.map(el => el.message).join(", "));
    }

    // 3. Save to DB
    const newListing = new Listing(req.body.listing);
    await newListing.save();

    res.redirect("/listings");
}));


//edit route
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing });
}));


//update route
app.put("/listings/:id",validateListing, wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listingData = req.body.listing;
    if (!listingData.image) {
        listingData.image = {
            filename: "default-image",
            url: "https://images.unsplash.com/photo-1725940896118-739f53527af9?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoYXJtaW5nJTIwY290dGFnZXxlbnwwfHwwfHx8MA%3D%3D"
        };
    }
    await Listing.findByIdAndUpdate(id, listingData, { new: true });
    res.redirect(`/listings/${id}`);
}));


//delete route
app.delete("/listings/:id", wrapAsync(async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    res.redirect("/listings");
}));

//Post Reviews Route
app.post("/listings/:id/reviews", validateReview, wrapAsync(async(req, res) => {
    let listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    
    listing.reviews.push(newReview);
    
    await newReview.save();
    await listing.save();
    
    res.redirect(`/listings/${listing._id}`);
}));

//Delete Review Route
app.delete("/listings/:id/reviews/:reviewId", wrapAsync(async (req, res) => {
    let {id, reviewId} = req.params;

    await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});
    await Review.findByIdAndDelete(reviewId);

    res.redirect(`/listings/${id}`);
}));


function validateListing(req, res, next) {
    const { image } = req.body.listing;

    // Ensure `image` exists and has a `url` property
    if (!image || typeof image.url !== "string") {
        throw new ExpressError(400, "Image URL is missing or invalid.");
    }

    // Validate URL format
    try {
        const parsedURL = new URL(image.url);
        if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
            throw new ExpressError(400, "URL must use HTTP or HTTPS.");
        }
    } catch (err) {
        throw new ExpressError(400, "Invalid URL format.");
    }

    // Validate rest of the data using Joi
    const { error } = listingSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
    if (error) {
        const errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    }

    next();
}


function validateReview(req, res, next) {
    let {error} = reviewSchema.validate(req.body);

    if(error){
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};


app.all("*", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});


app.use((err, req, res, next) => {
    let { statusCode = 500, message = "Something went wrong!"} = err;
    // res.status(statusCode).send(message);
    res.status(statusCode).render("error.ejs", {message});
});



const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
